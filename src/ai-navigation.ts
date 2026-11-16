import {
  AI_OBSTACLES,
  heldAIRates,
  probeAIForward,
  requestAIBarrierJump,
} from './ai-obstacles.ts';
import { GAME_TABLES } from './game-tables.ts';
import type {
  Point2,
  PathNode,
  Vec3,
  NavigationOptions,
  Runner,
} from './game-types.ts';
import { type Simulation } from './simulation.ts';
export const AI_NAVIGATION = GAME_TABLES.ai.navigation;
const RAD = Math.PI / 180;
const clock = (sim: { elapsed: number; countdown: number }) =>
  sim.elapsed + GAME_TABLES.entrance.seconds - sim.countdown;
const point = (node: { position: any }) => ({
  x: node.position[0],
  y: node.position[1],
  z: node.position[2],
});
const forward = (r: Pick<Runner, 'yaw'> & Partial<Runner>) => ({
  x: -Math.sin(r.yaw),
  z: -Math.cos(r.yaw),
});
const unit = (x: number, z: number) => {
  const length = Math.hypot(x, z);
  return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
};
const rotate = (n: { x: any; z: any }, degrees: number) => {
  const a = degrees * RAD,
    c = Math.cos(a),
    s = Math.sin(a);
  return { x: n.x * c + n.z * s, z: -n.x * s + n.z * c };
};

// 42c610 constructs a corridor for each graph edge and temporary connector.
export function routeSegment(
  start: Vec3,
  end: Vec3,
  {
    startNode = null,
    endNode = null,
    color = 0,
  }: {
    startNode?: number | null;
    endNode?: number | null;
    color?: number;
  } = {},
) {
  const length = Math.hypot(end.x - start.x, end.z - start.z),
    direction = unit(end.x - start.x, end.z - start.z),
    normal = { x: -direction.z, z: direction.x };
  return {
    start: { x: start.x, y: start.y, z: start.z },
    end: { x: end.x, y: end.y, z: end.z },
    startNode,
    endNode,
    color,
    direction,
    normal,
    positive: rotate(normal, AI_NAVIGATION.correctionDegrees),
    negative: rotate(normal, -AI_NAVIGATION.correctionDegrees),
    advanceDistance: Math.max(
      length - AI_NAVIGATION.width,
      AI_NAVIGATION.width * AI_NAVIGATION.minimumAdvanceFactor,
    ),
  };
}

function links(sim: Simulation, node: PathNode) {
  return node.links
    .filter((id) => id >= 0)
    .map((id) => sim.paths.find((n) => n.id === id))
    .filter((n): n is PathNode => n != null);
}
// Both native pools contain 512 slots. Loaded graph nodes and their directed
// edges consume slots before 42c6d0 allocates any temporary route nodes.
function routePool(sim: Simulation) {
  return (sim.aiNavigationPool ??= {
    nodes: Array<import('./game-types.ts').PathNode | null>(
      AI_NAVIGATION.nodeCapacity,
    ).fill(null),
    segments: new Set<number>(),
    graphNodes: sim.paths.length,
    graphSegments: sim.paths.reduce(
      (n, p) => n + p.links.filter((id) => id >= 0).length,
      0,
    ),
  });
}
function nodeAt(sim: Simulation, id: number | null | undefined) {
  return id != null && id < 0
    ? routePool(sim).nodes[-id - 1]
    : sim.paths.find((n) => n.id === id);
}
function freeTemporary(sim: Simulation, node: PathNode) {
  const pool = routePool(sim);
  pool.nodes[-node.id - 1] = null;
  pool.segments.delete(node.segmentSlot!);
}
function chain(
  sim: Simulation,
  r: Pick<Runner, 'navigation'> & Partial<Runner>,
) {
  const result = [];
  let id = r.navigation?.segment.startNode;
  const seen = new Set();
  while (id != null && id < 0 && !seen.has(id)) {
    seen.add(id);
    const node = nodeAt(sim, id);
    if (!node) {
      break;
    }
    result.push(node);
    [id] = node.links;
  }
  return result;
}
export function clearRouteNodes(
  sim: Simulation,
  r: Pick<Runner, 'navigation'> & Partial<Runner>,
) {
  for (const node of chain(sim, r)) {
    freeTemporary(sim, node);
  }
}
export function navigationState(
  sim: Simulation,
  r: Pick<Runner, 'navigation'> & Partial<Runner>,
) {
  if (!r.navigation) {
    return null;
  }
  return {
    ...r.navigation,
    temporaryNodes: chain(sim, r).map((n) => ({
      id: n.id,
      nativeId: -1,
      position: n.position,
      next: n.links[0],
      segment: n.segment,
    })),
  };
}
export function routePoolState(sim: Simulation) {
  const p = routePool(sim);
  return {
    graphNodes: p.graphNodes,
    graphSegments: p.graphSegments,
    temporaryNodes: p.nodes.filter((n): n is PathNode => n != null).length,
    temporarySegments: p.segments.size,
    nodeCapacity: AI_NAVIGATION.nodeCapacity,
    segmentCapacity: AI_NAVIGATION.segmentCapacity,
  };
}

// 42c6d0 links to the requested node, but builds its corridor toward the OLD
// current node's position. On attack entry those can be different graph nodes.
// Negative JS IDs represent pool slots; every native temporary node has ID -1.
export function pushRouteNode(
  sim: Simulation,
  r: Pick<Runner, 'id' | 'navigation' | 'x' | 'y' | 'z'> & Partial<Runner>,
  { next = false } = {},
) {
  const nav = r.navigation!;
  if (!nav) {
    return false;
  }
  const current = nodeAt(sim, nav.segment.startNode),
    target = next ? nodeAt(sim, nav.segment.endNode) : current;
  if (!current || !target) {
    return false;
  }
  const pool = routePool(sim),
    slot = pool.nodes.findIndex((n, i) => i >= pool.graphNodes && n === null);
  if (slot < 0) {
    return false;
  }
  let segmentSlot = pool.graphSegments;
  while (
    segmentSlot < AI_NAVIGATION.segmentCapacity &&
    pool.segments.has(segmentSlot)
  ) {
    segmentSlot++;
  }
  if (segmentSlot >= AI_NAVIGATION.segmentCapacity) {
    return false;
  }
  const id = -slot - 1,
    segment = routeSegment(r, point(current), {
      startNode: id,
      endNode: target.id,
    });
  pool.nodes[slot] = {
    id,
    color: 0,
    position: [r.x, r.y, r.z],
    links: [target.id],
    segment,
    segmentSlot,
  };
  pool.segments.add(segmentSlot);
  nav.segment = segment;
  nav.refreshAt = Math.fround(clock(sim) + AI_NAVIGATION.temporarySeconds);
  sim.emit('aiBreadcrumb', { runner: r.id, node: id, next: target.id });
  return true;
}

function assignRoute(
  sim: Simulation,
  previous: import('./game-types.ts').Navigation | null,
  forcedRoute: number | null | undefined,
) {
  const counts = sim.aiRouteCounts;
  if (previous?.routeIndex != null) {
    counts[previous.routeIndex]--;
  }
  if (forcedRoute !== undefined) {
    if (forcedRoute != null) {
      counts[forcedRoute]++;
    }
    return {
      routeIndex: forcedRoute,
      goalColor:
        forcedRoute == null ? 0 : AI_NAVIGATION.routeColors[forcedRoute],
    };
  }
  for (let i = 0; i < 5; i++) {
    const index = (sim.round + i) % 5;
    if (counts[index] < AI_NAVIGATION.routeLimits[index][sim.round - 1]) {
      counts[index]++;
      return { routeIndex: index, goalColor: AI_NAVIGATION.routeColors[index] };
    }
  }
  return { routeIndex: null, goalColor: 0 };
}
export function resetNavigation(
  sim: Simulation,
  r: Pick<
    Runner,
    'acceleration' | 'aiState' | 'id' | 'navigation' | 'speed' | 'x' | 'y' | 'z'
  > &
    Partial<Runner>,
  { routeIndex, goalColor }: NavigationOptions = {},
) {
  const nodes = sim.paths.filter((n) => n.color === AI_NAVIGATION.centralColor);
  let closest = null;
  let best = Infinity;
  for (const n of nodes) {
    const p = point(n),
      d = Math.hypot(p.x - r.x, p.z - r.z);
    if (d < best) {
      best = d;
      closest = n;
    }
  }
  if (!closest) {
    r.navigation = null;
    return;
  }
  clearRouteNodes(sim, r);
  const route = assignRoute(sim, r.navigation, routeIndex);
  if (goalColor != null) {
    route.goalColor = goalColor;
  }
  r.navigation = {
    ...route,
    segment: routeSegment(point(closest), point(closest), {
      startNode: closest.id,
      endNode: closest.id,
      color: closest.color,
    }),
    alignment: null,
    attackCollisions: 0,
    visited: 0,
    temporaryVisited: 0,
    refreshAt: 0,
  };
  r.speed = AI_NAVIGATION.initialSpeed;
  beginRouteRecovery(sim, r);
}

// 42d7e4 is used when a temporary connector rejoins the central graph.
// 42d8c0 prefers a route color, then the central color; 42d864 performs one
// random choice and at most one increment for each of its two rejection rules.
export function chooseRouteLink(
  sim: Simulation,
  r: Pick<Runner, 'navigation' | 'yaw'> & Partial<Runner>,
  node: PathNode,
  previous: number,
  { connector = false } = {},
) {
  const options = links(sim, node),
    nav = r.navigation!;
  if (!options.length) {
    return null;
  }
  if (connector && node.color === AI_NAVIGATION.centralColor) {
    const desired = options.find((n) => n.color === nav.goalColor);
    if (desired) {
      return desired;
    }
    const first = unit(
        point(options[0]).x - node.position[0],
        point(options[0]).z - node.position[2],
      ),
      f = forward(r);
    return options[
      first.x * f.z - f.x * first.z < 0 ? 0 : Math.min(1, options.length - 1)
    ];
  }
  const excluded = options.findIndex((n) => n.id === previous);
  if (!connector && node.color !== nav.goalColor) {
    const preferred =
      options.find((n) => n.color === nav.goalColor) ||
      options.find(
        (n, i) => n.color === AI_NAVIGATION.centralColor && i !== excluded,
      );
    if (preferred) {
      return preferred;
    }
  }
  let index = sim.randomInt() % options.length;
  if (index === excluded) {
    index = (index + 1) % options.length;
  }
  if (options[index].color !== node.color) {
    index = (index + 1) % options.length;
  }
  return options[index];
}

export function beginRouteRecovery(
  sim: Simulation,
  r: Pick<
    Runner,
    'acceleration' | 'aiState' | 'id' | 'navigation' | 'x' | 'y' | 'z'
  > &
    Partial<Runner>,
  {
    normal = null,
    obstacle = false,
  }: { normal?: Point2 | null; obstacle?: boolean } = {},
) {
  const nav = r.navigation!;
  if (!nav) {
    return;
  }
  const current = nodeAt(sim, nav.segment.startNode);
  let direction;
  if (obstacle) {
    // 42d494 only searches when the current node belongs to the real graph.
    const visible = (n: { position: number[] }) =>
      !sim.lineBlocked(
        { ...r, y: r.y + 1 },
        { ...point(n), y: n.position[1] + 1 },
      );
    const chosen =
      current != null &&
      current.id >= 0 &&
      (sim.paths.find((n) => n.color === current.color && visible(n)) ||
        sim.paths.find(
          (n) => n.color === AI_NAVIGATION.centralColor && visible(n),
        ));
    if (chosen) {
      nav.segment = routeSegment(point(chosen), point(chosen), {
        startNode: chosen.id,
        endNode: chosen.id,
        color: chosen.color,
      });
    } else {
      direction = normal ? unit(normal.x, normal.z) : { x: 0, z: 0 };
      r.acceleration = 0;
    }
  }
  if (!direction) {
    pushRouteNode(sim, r);
    direction = nav.segment.direction;
  }
  nav.alignment = { ...direction };
  r.aiState.mode = 'recover';
  r.aiState.target = null;
  r.aiState.recoverUntil = Math.fround(
    Math.fround(clock(sim)) + AI_NAVIGATION.alignSeconds,
  );
  sim.emit('aiRecovery', {
    runner: r.id,
    obstacle,
    target: nav.segment.endNode,
  });
}

// Physics records its classified result for the NEXT controller update, as
// native 431280/431d88 do. Runner contacts do not count as attack wall hits.
export function noteAIContact(
  _sim: import('./simulation.ts').Simulation,
  r: Pick<Runner, 'aiContact'> & Partial<Runner>,
  normal: Point2,
  {
    kind = 'wall',
    runner = null,
  }: { kind?: string; runner?: number | null } = {},
) {
  r.aiContact ??= { clear: true };
  r.aiContact.clear = false;
  if (kind === 'runner') {
    r.aiContact.runner = runner;
  } else {
    r.aiContact.wall = normal;
  }
}

function avoidRunner(
  sim: Simulation,
  r: Pick<
    Runner,
    'acceleration' | 'aiContact' | 'aiState' | 'id' | 'navigation' | 'yaw'
  > &
    Partial<Runner>,
) {
  const f = forward(r),
    a = AI_OBSTACLES.runnerAvoidRadians,
    c = Math.cos(a),
    s = Math.sin(a);
  r.navigation!.alignment = { x: f.x * c - f.z * s, z: f.x * s + f.z * c };
  r.acceleration = 0;
  r.aiState.mode = 'recover';
  r.aiState.target = null;
  r.aiState.recoverUntil = Math.fround(
    Math.fround(clock(sim)) + AI_OBSTACLES.runnerAvoidSeconds,
  );
  sim.emit('aiRunnerAvoid', { runner: r.id, other: r.aiContact.runner });
}

export function stepNavigation(
  sim: Simulation,
  r: Pick<
    Runner,
    | 'acceleration'
    | 'aiContact'
    | 'aiMaxSpeed'
    | 'aiState'
    | 'forwardVector'
    | 'id'
    | 'navigation'
    | 'targetNode'
    | 'turn'
    | 'turnAcceleration'
    | 'x'
    | 'y'
    | 'yaw'
    | 'z'
    | 'zoneMask'
  > &
    Partial<Runner>,
  dt: number,
  maxAcceleration: number,
) {
  const nav = r.navigation!;
  if (!nav) {
    return null;
  }
  const f = forward(r),
    now = clock(sim);
  if (r.aiState.mode === 'recover') {
    const d = nav.alignment || nav.segment.direction,
      cross = d.x * f.z - f.x * d.z,
      alignment = f.x * d.x + f.z * d.z;
    const rates = {
      turn: Math.sign(cross) * GAME_TABLES.runners[r.id].maxTurnDegrees * RAD,
      turnAcceleration: AI_NAVIGATION.alignTurnAccelerationDegrees * RAD,
      acceleration: r.acceleration,
    };
    if (
      alignment > AI_NAVIGATION.alignment - dt ||
      now > r.aiState.recoverUntil
    ) {
      r.aiState.mode = 'path';
    }
    return rates;
  }
  const contact = r.aiContact || { clear: false };
  if (!contact.clear) {
    if (contact.wall) {
      beginRouteRecovery(sim, r, { normal: contact.wall, obstacle: true });
      return heldAIRates(r);
    }
    if (contact.runner != null) {
      avoidRunner(sim, r);
      return heldAIRates(r);
    }
  } else {
    const hits = probeAIForward(sim, r);
    if (hits.length) {
      const level =
        GAME_TABLES.ai.levels[
          GAME_TABLES.ai.aggression[sim.arena - 1][sim.round - 1]
        ];
      // 42d109: the entrance-region overlap permits path jumps even when the
      // aggression row disables them. Attack jumps have no such override.
      if (
        hits.some((h) => h.kind === 'barrier') &&
        (level.barrierJumpEnabled ||
          (r.zoneMask ?? 0) & (sim.entranceZoneMask ?? 0))
      ) {
        requestAIBarrierJump(sim, r);
      }
      return heldAIRates(r);
    }
  }
  if (sim.time <= AI_NAVIGATION.retreatSeconds) {
    nav.goalColor = AI_NAVIGATION.centralColor;
  }
  let { segment } = nav,
    dx = r.x - segment.start.x,
    dz = r.z - segment.start.z;
  if (Math.hypot(dx, dz) > segment.advanceDistance) {
    const old = nodeAt(sim, segment.startNode),
      node = nodeAt(sim, segment.endNode);
    if (old && node) {
      const temporary = old.id < 0,
        next =
          node.id < 0
            ? null
            : chooseRouteLink(sim, r, node, old.id, { connector: temporary });
      if (node.id < 0 || next) {
        if (temporary) {
          freeTemporary(sim, old);
        }
        nav.segment =
          node.id < 0
            ? node.segment!
            : routeSegment(point(node), point(next!), {
                startNode: node.id,
                endNode: next!.id,
                color: node.color,
              });
        segment = nav.segment;
        dx = r.x - segment.start.x;
        dz = r.z - segment.start.z;
        // 446764 returns true when no intersections were collected. 42d680
        // extends a newly exposed temporary segment when its start is visible.
        if (
          node.id < 0 &&
          !sim.lineBlocked(
            { ...r, y: r.y + 1 },
            { ...point(node), y: node.position[1] + 1 },
          )
        ) {
          segment.advanceDistance = Math.fround(
            Math.hypot(dx, dz) + AI_NAVIGATION.temporaryAdvance,
          );
        }
        nav.visited++;
        if (temporary) {
          nav.temporaryVisited++;
        }
        r.targetNode = sim.paths.findIndex((n) => n.id === segment.endNode);
        sim.emit('aiNode', {
          runner: r.id,
          node: node.id,
          next: segment.endNode,
          temporary,
        });
      }
    }
  }
  const error = dx * segment.normal.x + dz * segment.normal.z;
  let n;
  if (error > AI_NAVIGATION.width) {
    n = segment.positive;
  } else if (error < -AI_NAVIGATION.width) {
    n = segment.negative;
  } else {
    n = segment.normal;
  }

  r.aiMaxSpeed =
    GAME_TABLES.runners[r.id].maxSpeed *
    (segment.color === AI_NAVIGATION.centralColor
      ? AI_NAVIGATION.centralSpeedFactor
      : GAME_TABLES.ai.levels[
          GAME_TABLES.ai.aggression[sim.arena - 1][sim.round - 1]
        ].speedFactor);
  return {
    turn: AI_NAVIGATION.turnDegrees * (f.x * n.x + f.z * n.z) * RAD,
    turnAcceleration: r.turnAcceleration,
    acceleration: maxAcceleration,
  };
}
