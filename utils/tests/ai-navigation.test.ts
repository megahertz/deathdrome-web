import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { stepAIAttack, stepAITarget, aiClock } from '../../src/ai-actions.ts';
import {
  AI_NAVIGATION,
  routeSegment,
  chooseRouteLink,
  beginRouteRecovery,
  noteAIContact,
  stepNavigation,
  pushRouteNode,
  clearRouteNodes,
  navigationState,
  routePoolState,
} from '../../src/ai-navigation.ts';
import { updateDrive, originalDamping } from '../../src/drive.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { View, THREE } from '../../src/renderer.ts';
import { Simulation, DYNAMICS } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const graph = [
  { id: 0, color: 12, position: [0, 0, -100], links: [1, 3, -1] },
  { id: 1, color: 12, position: [100, 0, -100], links: [2, 0, -1] },
  { id: 2, color: 12, position: [100, 0, 0], links: [3, 1, -1] },
  { id: 3, color: 12, position: [0, 0, 0], links: [0, 2, -1] },
];
function setup() {
  const sim = new Simulation({ paths: graph, ground: () => 0 }),
    r = sim.runners[1];
  sim.countdown = 0;
  sim.runners.forEach((q) => (q.dead = Infinity));
  Object.assign(r, {
    dead: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 50,
    floor: 0,
    turnAcceleration: 0,
  });
  Object.assign(r.aiState, {
    mode: 'path',
    attackAfter: Infinity,
    jumpAt: Infinity,
    barrierAt: Infinity,
    enhancerAt: Infinity,
  });
  clearRouteNodes(sim, r);
  r.navigation!.goalColor = 12;
  r.navigation!.segment = routeSegment(
    r,
    { x: 0, y: 0, z: -100 },
    { startNode: 3, endNode: 0, color: 12 },
  );
  return { sim, r };
}

test('native navigation constants and route capacity table match executable data', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    at = (va: number) => va - 0x480000 + 0x68e00;
  for (const [name, va] of Object.entries({
    minimumAdvanceFactor: 0x483e1b,
    turnDegrees: 0x483f46,
    centralSpeedFactor: 0x483f4a,
    alignment: 0x483e37,
    alignSeconds: 0x483e33,
    retreatSeconds: 0x483dc7,
    temporaryAdvance: 0x483f62,
  })) {
    assert.equal(
      AI_NAVIGATION[name as keyof typeof AI_NAVIGATION],
      exe.readFloatLE(at(va)),
    );
  }
  const code = (va: number) => va - 0x410000 + 0x400;
  assert.equal(
    AI_NAVIGATION.nodeCapacity,
    exe.readUInt32LE(code(0x42dc37)) / exe.readUInt8(code(0x42dc35)),
  );
  assert.equal(
    AI_NAVIGATION.segmentCapacity,
    exe.readUInt32LE(code(0x42dc03)) / exe.readUInt8(code(0x42dc01)),
  );
  for (let i = 0; i < 5; i++) {
    assert.equal(
      AI_NAVIGATION.routeColors[i],
      exe.readUInt32LE(at(0x48f144) + i * 4),
    );
    for (let j = 0; j < 3; j++) {
      assert.equal(
        AI_NAVIGATION.routeLimits[i][j],
        exe.readUInt32LE(at(0x48db78) + i * 12 + j * 4),
      );
    }
  }
  assert.ok(
    exe.includes(Buffer.from([0x68, 0, 0, 0x34, 0x42])),
    'native +45 degree correction',
  );
  assert.ok(
    exe.includes(Buffer.from([0xc7, 0x83, 0x98, 1, 0, 0, 0, 0, 0x48, 0xc2])),
    'native -50 local Z initial speed',
  );
});
test('route corridors use a ten-unit width, forty-five degree correction and radial advance threshold', () => {
  const { sim, r } = setup(),
    { segment } = r.navigation!;
  assert.equal(segment.advanceDistance, 90);
  assert.equal(routeSegment(r, { x: 0, y: 0, z: -2 }).advanceDistance, 5);
  r.z = -30;
  for (const [x, sign] of [
    [10, 0],
    [10.001, 1],
    [-10.001, -1],
  ]) {
    r.x = x;
    const rates = stepNavigation(sim, r, 1 / 60, 100);
    close(rates!.turn, (sign * 300 * Math.SQRT1_2 * Math.PI) / 180);
  }
  Object.assign(r, { x: 0, z: -90 });
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.navigation!.segment.startNode, 3);
  r.z = -90.01;
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.navigation!.segment.startNode, 0);
  assert.equal(r.navigation!.visited, 1);
});
test('native route choice preserves one-step random rejection rules and color preference', () => {
  const sim = stateFixture<import('../../src/simulation.ts').Simulation>({
      paths: [
        { id: 0, color: 12, position: [0, 0, 0], links: [1, 2, 3] },
        { id: 1, color: 40, position: [1, 0, 0] },
        { id: 2, color: 202, position: [0, 0, 1] },
        { id: 3, color: 12, position: [-1, 0, 0] },
      ],
      randomInt: () => 0,
    }),
    node = sim.paths[0],
    r = { yaw: 0, navigation: { goalColor: 12 } };
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      node,
      -1,
    )!.id,
    2,
    'different color advances only once, even if next color also differs',
  );
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      node,
      1,
    )!.id,
    3,
    'excluded previous index and different-color checks each increment',
  );
  r.navigation.goalColor = 202;
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      node,
      3,
    )!.id,
    2,
  );
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      node,
      -1,
      { connector: true },
    )!.id,
    2,
  );
  r.navigation.goalColor = 102;
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      node,
      -1,
    )!.id,
    3,
    'unavailable desired color falls back to the central route',
  );
});
test('alignment recovery turns at the native limit and returns early when aligned', () => {
  const { sim, r } = setup();
  r.z = 30;
  beginRouteRecovery(sim, r);
  r.yaw = Math.PI / 2;
  let rates = stepNavigation(sim, r, 1 / 60, 100);
  close(rates!.turn, (-185 * Math.PI) / 180);
  assert.equal(r.aiState.mode, 'recover');
  r.yaw = Math.acos(0.89);
  rates = stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.aiState.mode, 'path');
  close(
    rates!.turnAcceleration,
    (AI_NAVIGATION.alignTurnAccelerationDegrees * Math.PI) / 180,
  );
  r.z = 30;
  beginRouteRecovery(sim, r);
  sim.elapsed = 4;
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.aiState.mode, 'path');
});
test('obstacle recovery uses scene visibility without teleporting heading; attacks tolerate ten contacts', () => {
  const { sim, r } = setup(),
    { yaw } = r;
  sim.lineBlocked = () => true;
  r.acceleration = 100;
  noteAIContact(sim, r, { x: 1, z: 0 });
  assert.equal(
    r.aiState.mode,
    'path',
    'physics queues the hit for the next controller update',
  );
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.yaw, yaw);
  assert.equal(r.acceleration, 0);
  assert.equal(r.aiState.mode, 'recover');
  assert.deepEqual(r.navigation!.alignment, { x: 1, z: 0 });
  sim.runners[0].dead = 0;
  r.aiState.mode = 'attack';
  r.navigation!.attackCollisions = 0;
  for (let i = 0; i < 10; i++) {
    noteAIContact(sim, r, { x: 1, z: 0 });
    stepAIAttack(sim, r, sim.runners[0], GAME_TABLES.ai.levels[0]);
  }
  assert.equal(r.aiState.mode, 'attack');
  stepAIAttack(sim, r, sim.runners[0], GAME_TABLES.ai.levels[0]);
  assert.equal(r.aiState.mode, 'recover');
});
test('native direct path rates damp at zero angular acceleration and central routes cap speed at eighty percent', () => {
  const { sim, r } = setup();
  r.movementEnabled = true;
  r.yaw = 0.1;
  r.speed = 500;
  const rates = stepNavigation(sim, r, 1 / 60, 100),
    { turn } = rates!;
  updateDrive(r, { driveRates: rates }, 1 / 60, DYNAMICS);
  close(r.turn, turn * originalDamping(15 / 60));
  close(r.speed, 80 * AI_NAVIGATION.centralSpeedFactor);
});
test('isolated runner traverses a closed graph repeatedly without guessed button steering', () => {
  const { sim, r } = setup();
  for (let i = 0; i < 1800; i++) {
    sim.step(1 / 60);
  }
  assert.ok(r.navigation!.visited >= 12, JSON.stringify(r.navigation));
  assert.ok(r.x > -30 && r.x < 130 && r.z > -130 && r.z < 30);
  assert.equal(r.health, 100);
  assert.equal(sim.phase, 'running');
});
test('route reservations respect native per-round capacity and remain stable across respawns', () => {
  const sim = new Simulation({ paths: graph });
  assert.deepEqual(sim.aiRouteCounts, [0, 2, 2, 0, 0]);
  const r = sim.runners[1];
  assert.equal(r.speed, 50);
  for (let i = 0; i < 8; i++) {
    sim.spawn(r);
  }
  assert.deepEqual(sim.aiRouteCounts, [0, 2, 2, 0, 0]);
  assert.equal(sim.runners[0].speed, 0);
});
test('visibility rays honor endpoints and horizontal faces without touching gate or door callbacks', () => {
  const view = Object.create(View.prototype),
    material = new THREE.MeshBasicMaterial(),
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  view.arenaGroup = new THREE.Group();
  view.arenaGroup.add(mesh);
  mesh.userData.intersect = true;
  mesh.userData.secretDoor = 'x';
  view.arenaGroup.userData.portal = '01';
  view.arenaGroup.updateMatrixWorld(true);
  view.ray = new THREE.Raycaster();
  view.collisionMaterials = new Map([[material, material.side]]);
  let touches = 0;
  view.onPortalTouch = () => touches++;
  view.onDoorTouch = view.onPortalTouch;
  assert.equal(
    view.lineBlocked({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 0.2 }),
    false,
  );
  assert.equal(
    view.lineBlocked({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -2 }),
    true,
  );
  assert.equal(touches, 0);
  assert.equal(material.side, THREE.FrontSide);
  mesh.rotation.x = -Math.PI / 2;
  view.arenaGroup.updateMatrixWorld(true);
  assert.equal(
    view.lineBlocked({ x: 0, y: 2, z: 0 }, { x: 0, y: -2, z: 0 }),
    true,
  );
  mesh.visible = false;
  assert.equal(
    view.lineBlocked({ x: 0, y: 2, z: 0 }, { x: 0, y: -2, z: 0 }),
    false,
  );
});

test('attack entry links to the next graph node while its corridor points at the old current node', () => {
  const { sim, r } = setup();
  Object.assign(r, { x: 20, z: -30 });
  const target = sim.runners[0];
  Object.assign(target, { dead: 0, x: 80, y: 0, z: -30 });
  r.aiState.attackAfter = 0;
  const before = routePoolState(sim).temporaryNodes;
  assert.equal(stepAITarget(sim, r, GAME_TABLES.ai.levels[1]), target);
  const nodes = navigationState(sim, r)!.temporaryNodes;
  assert.equal(nodes.length, 1);
  const node = nodes[0];
  assert.deepEqual(node.position, [20, 0, -30]);
  assert.equal(node.next, 0);
  assert.deepEqual(node.segment!.end, { x: 0, y: 0, z: 0 });
  assert.equal(routePoolState(sim).temporaryNodes, before + 1);
  assert.equal(r.navigation!.refreshAt, aiClock(sim) + 1);
  assert.equal(r.aiState.mode, 'attack');
});
test('attack refreshes one temporary node per second and recovery retraces and frees one node per update', () => {
  const { sim, r } = setup();
  Object.assign(r, { x: 20, z: -30 });
  pushRouteNode(sim, r, { next: true });
  const first = r.navigation!.segment.startNode;
  r.aiContact = { clear: true };
  const q = sim.runners[0],
    level = GAME_TABLES.ai.levels[0];
  Object.assign(q, { dead: 0, x: 200, y: 0, z: -30, speed: 30 });
  sim.elapsed = 0.99;
  stepAIAttack(sim, r, q, level);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 1);
  sim.elapsed = 1;
  Object.assign(r, { x: 40, z: -30 });
  stepAIAttack(sim, r, q, level);
  const second = r.navigation!.segment.startNode;
  assert.notEqual(second, first);
  assert.equal(navigationState(sim, r)!.temporaryNodes[0].next, first);
  assert.equal(r.navigation!.refreshAt, 9);
  Object.assign(r, { x: 60, z: -30 });
  beginRouteRecovery(sim, r);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 3);
  r.aiState.mode = 'path';
  r.z = -45;
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.navigation!.segment.startNode, second);
  assert.equal(r.navigation!.segment.advanceDistance, 29);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 2);
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(
    r.navigation!.segment.startNode,
    second,
    'visible start extends the next radial advance beyond current distance',
  );
  sim.lineBlocked = () => true;
  r.aiContact = { clear: false };
  Object.assign(r, { x: 80, z: -30 });
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.navigation!.segment.startNode, first);
  close(r.navigation!.segment.advanceDistance, Math.hypot(20, 30) - 10);
  stepNavigation(sim, r, 1 / 60, 100);
  assert.equal(r.navigation!.segment.startNode, 0);
  assert.equal(r.navigation!.segment.endNode, 1);
  assert.equal(r.navigation!.temporaryVisited, 3);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 0);
});
test('temporary rejoin to a colored graph uses random rejection without the normal preferred-color search', () => {
  const sim = stateFixture<import('../../src/simulation.ts').Simulation>({
      paths: [
        { id: 0, color: 202, position: [0, 0, 0], links: [1, 2, -1] },
        { id: 1, color: 40, position: [1, 0, 0] },
        { id: 2, color: 202, position: [0, 0, 1] },
      ],
      randomInt: () => 0,
    }),
    r = { yaw: 0, navigation: { goalColor: 40 } };
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      sim.paths[0],
      -1,
    )!.id,
    1,
  );
  assert.equal(
    chooseRouteLink(
      sim,
      r as unknown as import('../../src/game-types.ts').Runner,
      sim.paths[0],
      -1,
      { connector: true },
    )!.id,
    2,
  );
});
test('temporary obstacle recovery retains its chain and aligns to the contact normal without a graph search', () => {
  const { sim, r } = setup();
  r.z = 30;
  pushRouteNode(sim, r);
  const head = r.navigation!.segment.startNode;
  let calls = 0;
  sim.lineBlocked = () => {
    calls++;
    return false;
  };
  beginRouteRecovery(sim, r, { obstacle: true, normal: { x: 1, z: 0 } });
  assert.equal(calls, 0);
  assert.equal(r.navigation!.segment.startNode, head);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 1);
  assert.deepEqual(r.navigation!.alignment, { x: 1, z: 0 });
  assert.equal(r.acceleration, 0);
});
test('respawning and retiring free reachable route chains without losing their route reservations', () => {
  const { sim, r } = setup();
  for (let i = 0; i < 6; i++) {
    r.z -= 20;
    pushRouteNode(sim, r);
  }
  const used = routePoolState(sim).temporaryNodes;
  sim.spawn(r);
  assert.equal(navigationState(sim, r)!.temporaryNodes.length, 1);
  assert.equal(routePoolState(sim).temporaryNodes, used - 5);
  assert.deepEqual(sim.aiRouteCounts, [0, 2, 2, 0, 0]);
  sim.population.retire(r);
  assert.equal(routePoolState(sim).temporaryNodes, used - 6);
  assert.equal(r.navigation, null);
  assert.deepEqual(sim.aiRouteCounts, [0, 1, 2, 0, 0]);
});
test('shared 512-slot pools reserve every directed graph edge and reject exhausted temporary allocations', () => {
  const paths = Array.from({ length: 170 }, (_, id) => ({
    id,
    color: 12,
    position: [id * 20, 0, 0],
    links: [(id + 1) % 170, (id + 2) % 170, (id + 3) % 170],
  }));
  const sim = new Simulation({ paths, maximumRunners: 8 }),
    allocated = sim.runners.filter(
      (r) => (r.navigation?.segment.startNode ?? 0) < 0,
    );
  assert.equal(allocated.length, 2);
  assert.equal(routePoolState(sim).temporarySegments, 2);
  const r = allocated[0],
    before = r.navigation!.segment,
    deadline = r.navigation!.refreshAt;
  assert.equal(pushRouteNode(sim, r), false);
  assert.equal(r.navigation!.segment, before);
  assert.equal(r.navigation!.refreshAt, deadline);
  clearRouteNodes(sim, allocated[1]);
  assert.equal(pushRouteNode(sim, r), true);
  assert.equal(routePoolState(sim).temporarySegments, 2);
});

test('native attack entry can bypass a temporary head without releasing its occupied pool slot', () => {
  const { sim, r } = setup(),
    before = routePoolState(sim).temporaryNodes;
  r.z = 30;
  pushRouteNode(sim, r);
  const first = r.navigation!.segment.startNode;
  r.z = 50;
  pushRouteNode(sim, r, { next: true });
  const state = navigationState(sim, r);
  assert.equal(state!.temporaryNodes.length, 1);
  assert.equal(state!.temporaryNodes[0].next, 3);
  assert.notEqual(state!.segment.startNode, first);
  assert.equal(routePoolState(sim).temporaryNodes, before + 2);
  clearRouteNodes(sim, r);
  assert.equal(
    routePoolState(sim).temporaryNodes,
    before + 1,
    '42cc4c only frees the reachable chain; arena reset clears the shared pool',
  );
});
