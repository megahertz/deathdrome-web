import { collisionResponse } from './collision-response.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Vec3 } from './game-types.ts';
import { findContactNode } from './scene-nodes.ts';
export { findContactNode } from './scene-nodes.ts';
// Original 431d88 classifies ordered scene intersections. 434c54 searches
// the hit node itself, then parents in reverse order, by case-sensitive
// name prefix. Query generation and native facet collection are separate.
export const CONTACT_KINDS = [
  'hotSpot',
  'key',
  'runner',
  'enhancer',
  'floor',
  'wall',
  'barrier',
  'scrub',
];
const PREFIXES = [
  ['key', 'EKey'],
  ['hotSpot', 'HotSpot_parent'],
  ['barrier', 'barrier_'],
  ['runner', 'runner_'],
  ['enhancer', 'enh_'],
];
export function classifyContacts(
  hits: import('./collision-types.ts').RawContact[],
  source: { x: number; y: number; z: number },
  endpoint: { x: number; y: number; z: number },
  {
    records = {},
    scrubCollidable = false,
  }: {
    records?: import('./collision-types.ts').ContactRecords;
    scrubCollidable?: boolean;
  } = {},
) {
  for (const hit of hits) {
    let kind = null,
      node = null;
    for (const [candidate, prefix] of PREFIXES) {
      node = findContactNode(hit.node, prefix);
      if (node) {
        kind = candidate;
        break;
      }
    }
    if (!kind && scrubCollidable) {
      node = findContactNode(hit.node, 'scrub_model');
      if (node) {
        kind = 'scrub';
      }
    }
    if (!kind) {
      kind = !records.floor && hit.normal.y > 0.71 ? 'floor' : 'wall';
      node = hit.node;
    }
    if (!records[kind]) {
      records[kind] = {
        ...hit,
        node,
        source: { ...source },
        endpoint: { ...endpoint },
      };
    }
  }
  return records;
}

const f = Math.fround,
  PI = 3.141592654;
const floatVector = (v: Vec3) => ({ x: f(v.x), y: f(v.y), z: f(v.z) });
const lift = (v: Vec3, height: number) => ({
  x: v.x,
  y: f(v.y + height),
  z: v.z,
});
// Original 4313f4 constructs and short-circuits up to three scene queries.
// query returns ordered raw hits; onFloor represents the separate 4320e8
// floor-following action when a fast main query collects a floor record.
export function collectRunnerContacts(
  r: Pick<
    import('./collision-types.ts').MovingRunner,
    | 'collisionCenter'
    | 'collisionClear'
    | 'collisionProbe'
    | 'deltaX'
    | 'deltaY'
    | 'deltaZ'
    | 'forwardVector'
    | 'frontVelocity'
    | 'id'
    | 'lateralSpeed'
    | 'localVerticalSpeed'
    | 'maxSpeed'
    | 'planarForwardVector'
    | 'previousCollisionCenter'
    | 'previousCollisionProbe'
    | 'previousPosition'
    | 'previousRearProbe'
    | 'rearProbe'
    | 'sideVelocity'
    | 'speed'
    | 'turn'
    | 'vy'
    | 'worldVelocity'
    | 'x'
    | 'y'
    | 'z'
  > &
    Partial<import('./collision-types.ts').MovingRunner>,
  seconds: number,
  query: import('./collision-types.ts').ContactQuery,
  {
    human = false,
    rearDistance = 7.5,
    scrubCollidable = false,
    onFloor = null,
  }: {
    human?: boolean;
    rearDistance?: number;
    scrubCollidable?: boolean;
    onFloor?:
      | ((
          r: Parameters<typeof collectRunnerContacts>[0],
          records: import('./collision-types.ts').ContactRecords,
        ) => void)
      | null;
  } = {},
) {
  const dt = f(seconds),
    position = floatVector(r),
    previous = floatVector(r.previousPosition),
    forward = floatVector(r.forwardVector),
    oldProbe = floatVector(r.collisionProbe),
    oldRear = floatVector(r.rearProbe),
    frontStep = f(dt * f(r.frontVelocity ?? 0)),
    worldStep = f(dt * f(r.worldVelocity.y));
  r.previousCollisionProbe = oldProbe;
  r.collisionProbe = {
    x: f(position.x + forward.x * 8),
    y: Math.max(0, f(f(position.y + frontStep) + f(forward.y * 8))),
    z: f(position.z + forward.z * 8),
  };
  r.previousCollisionCenter = previous;
  r.collisionCenter = {
    x: position.x,
    y: f(position.y + worldStep),
    z: position.z,
  };
  const records: import('./collision-types.ts').ContactRecords = {},
    queries: {
      from: { x: any; y: number; z: any };
      to: { x: any; y: number; z: any };
    }[] = [];
  function cast(
    source: { x: number; y: number; z: number },
    endpoint: any,
    height: number,
  ) {
    const from = lift(source, height),
      to = lift(endpoint, height),
      hits = query(from, to);
    queries.push({ from, to });
    if (hits.length > 0) {
      classifyContacts(hits, source, endpoint, { records, scrubCollidable });
    }
    return hits.length === 0;
  }
  function floor() {
    if (!records.floor) {
      return;
    }
    if (onFloor) {
      onFloor(r, records);
    } else {
      queries.push(
        ...followCollisionFloor(r, records, dt, query, { scrubCollidable })
          .queries,
      );
    }
  }
  function rear(slow: boolean) {
    if (!human) {
      return false;
    }
    r.previousRearProbe = oldRear;
    r.rearProbe = {
      x: f(position.x - forward.x * f(rearDistance)),
      y: f(
        position.y + dt * f(r.worldVelocity.y) - forward.y * f(rearDistance),
      ),
      z: f(position.z - forward.z * f(rearDistance)),
    };
    if (cast(slow ? previous : oldRear, r.rearProbe, f(3.9))) {
      return false;
    }
    r.collisionClear = false;
    if (records.floor) {
      records.wall = { ...records.floor };
    }
    return true;
  }
  const slow =
    Math.abs(f(r.deltaX)) + Math.abs(f(r.deltaY ?? 0)) + Math.abs(f(r.deltaZ)) <
    0.5;
  if (slow) {
    r.collisionClear = cast(previous, r.collisionProbe, 1.5);
    if (!r.collisionClear) {
      return { records, queries, clear: false };
    }
    r.collisionClear = cast(oldProbe, r.collisionCenter, 1.5);
    if (!r.collisionClear) {
      return { records, queries, clear: false };
    }
    if (rear(true)) {
      return { records, queries, clear: false };
    }
    return { records, queries, clear: true };
  }
  const turnDistance = f(
      Math.abs(((f((r.turn * 180) / Math.PI) * PI) / 180) * dt * 8),
    ),
    localZ = f(-r.speed),
    lateral = f(r.lateralSpeed ?? 0);
  const source =
    Math.abs(lateral) > Math.abs(localZ) ||
    (localZ > 0 && turnDistance < Math.abs(f(r.deltaZ)))
      ? oldProbe
      : previous;
  if (!cast(source, r.collisionProbe, 1.5)) {
    r.collisionClear = false;
    floor();
    return { records, queries, clear: false };
  }
  if (!cast(previous, r.collisionCenter, 1.5)) {
    r.collisionClear = false;
    floor();
    return { records, queries, clear: false };
  }
  if (rear(false)) {
    return { records, queries, clear: false };
  }
  r.collisionClear = true;
  return { records, queries, clear: true };
}

// 4320e8 tilts the physical forward vector to the collected floor and scales
// horizontal world velocity. Excess speed/lateral slip can request another
// forward query and replace the collected floor record.
export function followCollisionFloor(
  r: Pick<
    import('./collision-types.ts').MovingRunner,
    | 'collisionProbe'
    | 'forwardVector'
    | 'frontVelocity'
    | 'id'
    | 'lateralSpeed'
    | 'localVerticalSpeed'
    | 'maxSpeed'
    | 'planarForwardVector'
    | 'previousCollisionProbe'
    | 'sideVelocity'
    | 'speed'
    | 'vy'
    | 'worldVelocity'
    | 'x'
    | 'y'
    | 'z'
  > &
    Partial<import('./collision-types.ts').MovingRunner>,
  records: import('./collision-types.ts').ContactRecords,
  seconds: number,
  query: import('./collision-types.ts').ContactQuery,
  { scrubCollidable = false } = {},
) {
  const { floor } = records;
  if (!floor) {
    return { queries: [] };
  }
  const dt = f(seconds),
    normal = floatVector(floor.normal),
    world = floatVector(r.worldVelocity),
    length = f(Math.sqrt(world.x * world.x + world.z * world.z)),
    inverse = length ? f(1 / length) : 0,
    direction = { x: f(world.x * inverse), z: f(world.z * inverse) },
    planar = r.planarForwardVector;
  if (-(normal.x * direction.x + normal.z * direction.z) < 0) {
    return { queries: [] };
  }
  const slope = f(-(normal.x * f(planar.x) + normal.z * f(planar.z))),
    projection = Math.sqrt(1 - slope * slope),
    localX = Math.abs(f(r.lateralSpeed ?? 0)),
    localZ = Math.abs(f(-r.speed)),
    speed = f(
      Math.sqrt(
        f(r.lateralSpeed ?? 0) ** 2 +
          f(r.localVerticalSpeed ?? 0) ** 2 +
          f(-r.speed) ** 2,
      ),
    );
  r.forwardVector = {
    x: f(f(planar.x) * projection),
    y: slope,
    z: f(f(planar.z) * projection),
  };
  r.worldVelocity = {
    x: f(normal.y * world.x),
    y: world.y,
    z: f(normal.y * world.z),
  };
  if (
    localZ <= f(r.maxSpeed ?? GAME_TABLES.runners[r.id].maxSpeed) &&
    localX <= 20
  ) {
    return { queries: [] };
  }
  if (localX > localZ) {
    records.wall = { ...floor };
  }
  const vertical = f(speed * slope);
  r.frontVelocity = Math.max(vertical, f(r.frontVelocity));
  r.sideVelocity = Math.max(vertical, f(r.sideVelocity));
  r.worldVelocity.y = Math.max(vertical, world.y);
  r.vy = r.worldVelocity.y;
  const fw = r.forwardVector,
    step = f(dt * r.frontVelocity);
  r.collisionProbe = {
    x: f(f(r.x) + fw.x * 8),
    y: Math.max(0, f(f(f(r.y) + step) + f(fw.y * 8))),
    z: f(f(r.z) + fw.z * 8),
  };
  const source = floatVector(r.previousCollisionProbe),
    endpoint = r.collisionProbe,
    from = lift(source, 1.5),
    to = lift(endpoint, 1.5),
    hits = query(from, to);
  if (hits.length > 0) {
    delete records.floor;
    classifyContacts(hits, source, endpoint, { records, scrubCollidable });
  }
  return { queries: [{ from, to }] };
}

// 433048 tests a proposed correction with independent temporary contact
// records for every query. Only the wall category rejects the correction.
export function rejectCollisionPosition(
  r: Pick<
    import('./collision-types.ts').MovingRunner,
    | 'forwardVector'
    | 'frontVelocity'
    | 'previousCollisionCenter'
    | 'previousCollisionProbe'
    | 'worldVelocity'
  > &
    Partial<import('./collision-types.ts').MovingRunner>,
  candidate: { x: number; y: number; z: number },
  seconds: number,
  query: import('./collision-types.ts').ContactQuery,
  { human = false, rearDistance = 7.5, scrubCollidable = false } = {},
) {
  const dt = f(seconds),
    p = floatVector(candidate),
    fw = floatVector(r.forwardVector),
    step = f(dt * f(r.frontVelocity)),
    oldProbe = floatVector(r.previousCollisionProbe),
    oldCenter = floatVector(r.previousCollisionCenter),
    queries: {
      from: { x: any; y: number; z: any };
      to: { x: any; y: number; z: any };
    }[] = [];
  function wall(
    source: { x: number; y: number; z: number },
    endpoint: { x: number; y: number; z: number },
    height: number,
  ) {
    const from = lift(source, height),
      to = lift(endpoint, height),
      hits = query(from, to);
    queries.push({ from, to });
    return !!classifyContacts(hits, source, endpoint, { scrubCollidable }).wall;
  }
  const front = {
    x: f(p.x + fw.x * 8),
    y: Math.max(0, f(f(p.y + step) + f(fw.y * 8))),
    z: f(p.z + fw.z * 8),
  };
  if (wall(oldProbe, front, 1.5)) {
    return { rejected: true, queries };
  }
  const center = { x: p.x, y: f(p.y + dt * f(r.worldVelocity.y)), z: p.z };
  if (wall(oldCenter, center, 1.5)) {
    return { rejected: true, queries };
  }
  if (human) {
    const back = {
      x: f(p.x - fw.x * f(rearDistance)),
      y: f(p.y + dt * f(r.worldVelocity.y) - fw.y * f(rearDistance)),
      z: f(p.z - fw.z * f(rearDistance)),
    };
    if (wall(oldCenter, back, f(3.9))) {
      return { rejected: true, queries };
    }
  }
  return { rejected: false, queries };
}

// The native dispatcher handles special categories before an ordinary wall.
// Special-object handlers remain owned by the simulation; the geometric
// query/response pipeline can therefore also run with supplied scene records.
export function stepCollisionSweep(
  r: Pick<
    import('./collision-types.ts').MovingRunner,
    | 'actionMode'
    | 'collisionCenter'
    | 'collisionClear'
    | 'collisionMinimumSpeed'
    | 'collisionProbe'
    | 'deltaX'
    | 'deltaY'
    | 'deltaZ'
    | 'forwardVector'
    | 'frontVelocity'
    | 'id'
    | 'lateralSpeed'
    | 'localVerticalSpeed'
    | 'maxSpeed'
    | 'movementEnabled'
    | 'planarForwardVector'
    | 'previousActionMode'
    | 'previousCollisionCenter'
    | 'previousCollisionProbe'
    | 'previousForwardVector'
    | 'previousPlanarForwardVector'
    | 'previousPosition'
    | 'previousRearProbe'
    | 'rearProbe'
    | 'sideVelocity'
    | 'speed'
    | 'turn'
    | 'vy'
    | 'worldVelocity'
    | 'x'
    | 'y'
    | 'yaw'
    | 'z'
  > &
    Partial<import('./collision-types.ts').MovingRunner>,
  seconds: number,
  query: import('./collision-types.ts').ContactQuery,
  {
    human = false,
    scrubCollidable = false,
    onContact = () => {},
    onResponse = () => {},
  }: {
    human?: boolean;
    scrubCollidable?: boolean;
    onContact?: (
      kind: string,
      contact: import('./collision-types.ts').CollisionRecord,
    ) => void;
    onResponse?: (
      effect: import('./collision-types.ts').CollisionEffect,
      kind: string,
    ) => void;
  } = {},
) {
  const result = collectRunnerContacts(r, seconds, query, {
    human,
    scrubCollidable,
  });
  const responses: {
    applied: boolean;
    damage: number;
    landingCalls: number;
  }[] = [];
  if (result.clear) {
    return { ...result, response: null, responses };
  }
  function respond(kind: string) {
    const response = collisionResponse(r, result.records[kind], {
      dt: seconds,
      human,
      rejectCandidate(actor: any, candidate: any) {
        const correction = rejectCollisionPosition(
          actor,
          candidate,
          seconds,
          query,
          { human, scrubCollidable },
        );
        result.queries.push(...correction.queries);
        return correction.rejected;
      },
    });
    responses.push(response);
    onResponse(response, kind);
  }
  for (const kind of [
    'key',
    'hotSpot',
    'barrier',
    'runner',
    'enhancer',
    'scrub',
  ]) {
    if (result.records[kind]) {
      onContact(kind, result.records[kind]);
      // 431280 calls 43a0e0 before 432bb8 for the hot-spot record, even
      // when the trigger removes its BBOX. The ordinary wall follows later.
      if (kind === 'hotSpot') {
        respond(kind);
      }
    }
  }
  if (result.records.wall) {
    respond('wall');
  }
  return { ...result, response: responses.at(-1) ?? null, responses };
}
