import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { stepAIAttack, stepAIActions } from '../../src/ai-actions.ts';
import {
  routeSegment,
  stepNavigation,
  noteAIContact,
  clearRouteNodes,
} from '../../src/ai-navigation.ts';
import {
  AI_OBSTACLES,
  probeAIForward,
  barrierRayContacts,
} from '../../src/ai-obstacles.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { View, THREE } from '../../src/renderer.ts';
import { Simulation } from '../../src/simulation.ts';
const graph = [
  { id: 0, color: 12, position: [0, 0, -100], links: [1, 3, -1] },
  { id: 1, color: 12, position: [100, 0, -100], links: [2, 0, -1] },
  { id: 2, color: 12, position: [100, 0, 0], links: [3, 1, -1] },
  { id: 3, color: 12, position: [0, 0, 0], links: [0, 2, -1] },
];
function setup() {
  const s = new Simulation({ paths: graph, ground: () => 0 }),
    r = s.runners[1],
    q = s.runners[0];
  s.countdown = 0;
  clearRouteNodes(s, r);
  Object.assign(r, {
    x: 0,
    y: 0,
    z: -30,
    yaw: 0,
    speed: 30,
    turn: 0.2,
    turnAcceleration: 0.1,
    acceleration: 23,
    aiContact: { clear: true },
  });
  Object.assign(q, { x: 0, y: 0, z: -100, speed: 30 });
  r.navigation!.segment = routeSegment(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -100 },
    { startNode: 3, endNode: 0, color: 12 },
  );
  r.navigation!.goalColor = 12;
  r.navigation!.refreshAt = 100;
  Object.assign(r.aiState, {
    mode: 'path',
    target: 0,
    attackAfter: Infinity,
    jumpAt: Infinity,
    barrierAt: Infinity,
    enhancerAt: Infinity,
    shotAt: 100,
    previousDirection: { x: 0, z: -1 },
  });
  return { s, r, q };
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('AI forward probe lengths, runner avoidance and jump schedules come from the executable', async () => {
  const b = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    at = (v: number) => v - 0x48_00_00 + 0x6_8e_00;
  for (const [k, v] of Object.entries({
    probeHeight: 0x48_3f_3a,
    probeLength: 0x48_3f_3e,
    runnerAvoidSeconds: 0x48_3f_52,
    pathJumpSeconds: 0x48_3f_42,
    attackJumpRandomScale: 0x48_3e_07,
    attackJumpSeconds: 0x48_3e_0b,
  })) {
    assert.equal(
      AI_OBSTACLES[k as keyof typeof AI_OBSTACLES],
      b.readFloatLE(at(v)),
    );
  }
  assert.equal(AI_OBSTACLES.runnerAvoidRadians, b.readDoubleLE(at(0x48_3f_56)));
  close(AI_OBSTACLES.runnerAvoidRadians, Math.PI / 6);
});
test('look-ahead uses exact lifted endpoints and preserves all control rates when a wall is ahead', () => {
  const { s, r } = setup();
  let observed:
    | {
        a: import('../../src/game-types.ts').Vec3;
        b: import('../../src/game-types.ts').Vec3;
      }
    | undefined;
  s.sceneContacts = (a: any, b: any) => {
    observed = { a, b };
    return [{ kind: 'wall' }];
  };
  const before = r.navigation!.segment,
    rates = stepNavigation(s, r, 1 / 60, 100);
  assert.deepEqual(observed, {
    a: { x: 0, y: 1.5, z: -30 },
    b: { x: 0, y: 1.5, z: -50 },
  });
  assert.equal(r.navigation!.segment, before);
  assert.deepEqual(rates, {
    turn: 0.2,
    turnAcceleration: 0.1,
    acceleration: 23,
  });
  assert.equal(r.aiState.mode, 'path');
  r.forwardVector = { x: 0, y: 0.6, z: -0.8 };
  probeAIForward(s, r);
  assert.deepEqual(observed!.b, { x: 0, y: 13.5, z: -46 });
});
test('physical runner contact queues a thirty-degree avoidance turn without replacing the route', () => {
  const { s, r } = setup(),
    { segment } = r.navigation!;
  noteAIContact(s, r, { x: 1, z: 0 }, { kind: 'runner', runner: 2 });
  assert.equal(r.aiState.mode, 'path');
  const rates = stepNavigation(s, r, 1 / 60, 100);
  assert.equal(r.aiState.mode, 'recover');
  assert.equal(r.navigation!.segment, segment);
  close(r.navigation!.alignment!.x, 0.5);
  close(r.navigation!.alignment!.z, -Math.sqrt(0.75));
  assert.equal(r.aiState.recoverUntil, 10);
  assert.equal(rates!.acceleration, 0);
  assert.equal(rates!.turn, 0.2);
});
test('attack wall counting happens on the next controller update and runner contacts do not count', () => {
  const { s, r, q } = setup();
  r.aiState.mode = 'attack';
  noteAIContact(s, r, { x: 1, z: 0 }, { kind: 'runner', runner: 2 });
  const rates = stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]);
  assert.equal(r.navigation!.attackCollisions, 0);
  assert.deepEqual(rates, {
    turn: 0.2,
    turnAcceleration: 0.1,
    acceleration: 23,
  });
  noteAIContact(s, r, { x: 1, z: 0 });
  for (let i = 0; i < 10; i++) {
    stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]);
  }
  assert.equal(r.aiState.mode, 'attack');
  assert.equal(r.navigation!.attackCollisions, 10);
  stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]);
  assert.equal(r.aiState.mode, 'recover');
  assert.equal(r.navigation!.attackCollisions, 11);
});
test('blocked attack retains steering sign at the native turn limit without refreshing direction or breadcrumbs', () => {
  const { s, r, q } = setup();
  r.aiState.mode = 'attack';
  r.navigation!.refreshAt = 0;
  s.sceneContacts = () => [{ kind: 'wall' }];
  const old = r.aiState.previousDirection,
    before = r.navigation!.segment;
  const rates = stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]);
  close(rates.turn, (185 * Math.PI) / 180);
  assert.equal(rates.acceleration, 23);
  assert.equal(rates.turnAcceleration, 0.1);
  assert.equal(r.aiState.previousDirection, old);
  assert.equal(r.navigation!.segment, before);
  assert.equal(s.projectiles.length, 0);
  r.turn = -0.2;
  close(
    stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]).turn,
    (-185 * Math.PI) / 180,
  );
  r.turn = 0;
  assert.equal(stepAIAttack(s, r, q, GAME_TABLES.ai.levels[3]).turn, 0);
});
test('path barrier jumps preserve the encoded integer-division timer while attack jumps use the fractional timer', () => {
  const { s, r, q } = setup();
  s.arena = 5;
  s.round = 1;
  s.randomInt = () => 12_345;
  s.sceneContacts = () => [{ kind: 'barrier', owner: 1 }];
  const level = GAME_TABLES.ai.levels[3];
  stepNavigation(s, r, 1 / 60, 100);
  assert.equal(r.aiState.pendingJump, true);
  assert.equal(r.aiState.jumpAt, 7);
  r.aiState.pendingJump = false;
  r.aiState.mode = 'attack';
  stepAIAttack(s, r, q, level);
  assert.equal(r.aiState.pendingJump, false, 'attack ignores its own barrier');
  assert.equal(r.turn, 0.2);
  s.sceneContacts = () => [{ kind: 'barrier', owner: 2 }];
  stepAIAttack(s, r, q, level);
  assert.equal(r.aiState.pendingJump, true);
  assert.equal(
    r.aiState.jumpAt,
    Math.fround(
      7 +
        12_345 *
          AI_OBSTACLES.attackJumpRandomScale *
          AI_OBSTACLES.attackJumpSeconds,
    ),
  );
  assert.equal(stepAIActions(s, r, level).jump, true);
  r.aiState.pendingJump = false;
  stepAIAttack(s, r, q, GAME_TABLES.ai.levels[0]);
  assert.equal(r.aiState.pendingJump, false);
  close(r.turn, (185 * Math.PI) / 180);
});
test('all 1216 original obstacle decisions include entrance-region permission and float-stored tilted probes', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/ai-obstacles-native-audit.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.fixtureCount, 1216);
  for (const [i, f] of audit.fixtures.entries()) {
    const { s, r, q } = setup();
    s.entranceZoneMask = f.entranceZoneMask;
    r.zoneMask = f.zoneMask;
    if (f.position) {
      [r.x, r.y, r.z] = f.position;
      r.forwardVector = { x: f.forward[0], y: f.forward[1], z: f.forward[2] };
    }
    Object.assign(r.aiState, {
      mode: f.mode,
      jumpAt: 99,
      pendingJump: false,
      recoverUntil: 0,
    });
    r.aiContact = { clear: !f.kind.startsWith('contact-') };
    if (f.kind === 'contact-runner') {
      r.aiContact.runner = 0;
    }
    if (f.kind === 'contact-wall') {
      r.aiContact.wall = { x: 1, z: 0 };
    }
    let randomCalls = 0;
    const queries: any[][] = [];
    s.randomInt = () => {
      randomCalls++;
      return f.random;
    };
    s.lineBlocked = (a, b) => {
      queries.push([a.x, a.y, a.z, b.x, b.y, b.z]);
      return false;
    };
    s.sceneContacts = (
      a: { x: any; y: any; z: any },
      b: { x: any; y: any; z: any },
    ) => {
      queries.push([a.x, a.y, a.z, b.x, b.y, b.z]);
      return f.kind.startsWith('probe-')
        ? [
            {
              kind: f.kind.includes('barrier') ? 'barrier' : 'wall',
              owner: f.kind === 'probe-own-barrier' ? 1 : 2,
            },
          ]
        : [];
    };
    let found = false;
    for (let a = 0; a < 8 && !found; a++) {
      for (let b = 0; b < 3; b++) {
        if (GAME_TABLES.ai.aggression[a][b] === f.level) {
          s.arena = a + 1;
          s.round = b + 1;
          found = true;
          break;
        }
      }
    }
    let rates;
    for (let j = 0; j < f.steps; j++) {
      rates =
        f.mode === 'attack'
          ? stepAIAttack(s, r, q, GAME_TABLES.ai.levels[f.level])
          : stepNavigation(s, r, 1 / 60, 100);
    }
    const expected = audit.native[i];
    for (const [key, value] of Object.entries({
      turn: (rates!.turn * 180) / Math.PI,
      turnAcceleration: (rates!.turnAcceleration * 180) / Math.PI,
      acceleration: rates!.acceleration,
      recoverUntil: r.aiState.recoverUntil,
      jumpAt: r.aiState.jumpAt,
    })) {
      assert.ok(
        Math.abs(value - expected[key]) <= audit.tolerance,
        `${i}: ${key}`,
      );
    }
    for (const [key, value] of Object.entries({
      mode: r.aiState.mode,
      jumpRequests: r.aiState.pendingJump ? 1 : 0,
      randomCalls,
      attackCollisions: r.navigation!.attackCollisions,
      current: r.navigation!.segment.startNode,
      queries,
    })) {
      assert.deepEqual(value, expected[key], `${i}: ${key}`);
    }
  }
});
test('entrance-region permission stays at its initial sample and does not extend to attack jumps', () => {
  const { s, r, q } = setup(),
    mask = s.entranceZoneMask;
  assert.equal(
    mask,
    s.regions.maskAt(s.spawnPose(s.player).x, s.spawnPose(s.player).z),
  );
  s.countdown = 0;
  for (const candidate of s.runners) {
    candidate.inactive = candidate.id !== s.player;
  }
  s.runners[s.player].x = 300;
  s.step(1 / 60);
  assert.equal(s.entranceZoneMask, mask);
  s.entranceZoneMask = 1;
  r.zoneMask = 1;
  s.sceneContacts = () => [{ kind: 'barrier', owner: 2 }];
  s.randomInt = () => 0;
  s.arena = 1;
  s.round = 1;
  stepNavigation(s, r, 1 / 60, 100);
  assert.equal(r.aiState.pendingJump, true);
  r.aiState.pendingJump = false;
  stepAIAttack(s, r, q, GAME_TABLES.ai.levels[0]);
  assert.equal(r.aiState.pendingJump, false);
  r.zoneMask = 2;
  r.missileLockTarget = q.id;
  stepNavigation(s, r, 1 / 60, 100);
  assert.equal(
    r.aiState.pendingJump,
    false,
    'a missile lock does not supply path permission',
  );
});
test('barrier probe intersects connected faces within the native height and endpoint bands', () => {
  const trails = [
      {
        owner: 2,
        points: [
          { x: -5, z: -10 },
          { x: 5, z: -10 },
        ],
      },
    ],
    a = { x: 0, y: 1.5, z: 0 },
    b = { x: 0, y: 1.5, z: -20 };
  assert.deepEqual(barrierRayContacts(a, b, trails), [
    { kind: 'barrier', owner: 2, distance: 10 },
  ]);
  assert.equal(
    barrierRayContacts({ ...a, y: 4 }, { ...b, y: 4 }, trails).length,
    0,
  );
  assert.equal(barrierRayContacts(a, { ...b, z: -9 }, trails).length, 0);
  assert.equal(
    barrierRayContacts({ ...a, x: 6 }, { ...b, x: 6 }, trails).length,
    0,
  );
});
test('scene probes query current runner triangles, ignore self/dead runners and never open doors', () => {
  const view = Object.create(View.prototype);
  view.arenaGroup = new THREE.Group();
  view.collisionMaterials = new Map();
  view.ray = new THREE.Raycaster();
  const models = [0, 1].map(() => {
      const root = new THREE.Group(),
        m = new THREE.Mesh(
          new THREE.BoxGeometry(4, 3, 6),
          new THREE.MeshBasicMaterial(),
        );
      m.userData.intersect = true;
      root.add(m);
      return root;
    }),
    runners = [
      { id: 0, x: 0, y: 0, z: -10, yaw: 0, dead: 0 },
      { id: 1, x: 20, y: 0, z: -10, yaw: 0, dead: 0 },
    ],
    a = { x: 0, y: 1, z: 0 },
    b = { x: 0, y: 1, z: -20 };
  let touches = 0;
  view.onPortalTouch = () => touches++;
  view.onDoorTouch = view.onPortalTouch;
  assert.equal(
    view.lineContacts(a, b, { runners, models, ignore: 0 }).length,
    0,
  );
  runners[1].x = 0;
  const hits = view.lineContacts(a, b, { runners, models, ignore: 0 });
  assert.equal(hits[0].runner, 1);
  assert.equal(hits[0].distance, 7);
  assert.equal(
    (models[1].children[0] as import('../../src/model-types.ts').RenderNode)
      .material!.side,
    THREE.FrontSide,
  );
  runners[1].dead = 1;
  assert.equal(
    view.lineContacts(a, b, { runners, models, ignore: 0 }).length,
    0,
  );
  assert.equal(touches, 0);
});
test('AI restores its aggression cap on attack updates and acts before attack timeout recovery', () => {
  const { s, r } = setup();
  s.arena = 5;
  s.round = 1;
  r.aiState.mode = 'attack';
  r.aiState.attackUntil = 7;
  r.aiState.shotAt = 0;
  r.aiMaxSpeed = 1;
  s.ai(r, 1 / 60);
  assert.equal(
    r.aiMaxSpeed,
    GAME_TABLES.runners[1].maxSpeed *
      GAME_TABLES.ai.levels[GAME_TABLES.ai.aggression[4][0]].speedFactor,
  );
  assert.equal(r.aiState.mode, 'recover');
  assert.ok(
    s.projectiles.length > 0,
    'expiry frame still performs its native attack action',
  );
});
