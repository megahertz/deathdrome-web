import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clearRouteNodes,
  routeSegment,
  navigationState,
  routePoolState,
} from '../../src/ai-navigation.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';

test('160 original AI wrapper traces match 1440 transitions, primary dispatches and temporary-route states', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/ai-transitions-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.sequences, 160);
  assert.equal(audit.controllerActions, 1440);
  for (const [i, f] of audit.fixtures.entries()) {
    const sim = new Simulation({ paths: audit.graph, maximumRunners: 2 }),
      r = sim.runners[1],
      q = sim.runners[0];
    sim.countdown = 0;
    clearRouteNodes(sim, r);
    Object.assign(r, {
      x: 100,
      y: 0,
      z: -30,
      yaw: 0,
      speed: 30,
      turn: 0,
      turnAcceleration: 0,
      acceleration: 23,
      zoneMask: 1,
    });
    Object.assign(q, { x: 100, y: 0, z: -60, speed: 30, zoneMask: 1 });
    r.navigation = stateFixture<import('../../src/game-types.ts').Navigation>({
      goalColor: 12,
      attackCollisions: f.variant.startsWith('wall') ? 10 : 0,
      refreshAt: f.variant === 'refresh' ? 0 : 1000,
      visited: 0,
      temporaryVisited: 0,
      alignment: { x: 0, z: -1 },
      segment: routeSegment(
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 0, z: -100 },
        { startNode: 3, endNode: 0, color: 12 },
      ),
    });
    Object.assign(r.aiState, {
      mode: f.variant.startsWith('acquire') ? 'path' : 'attack',
      target: 0,
      attackAfter: f.deadline,
      attackUntil: f.deadline,
      recoverUntil: 0,
      shotAt: f.start,
      previousDirection: { x: 0, z: -1 },
      jumpAt: Infinity,
      barrierAt: Infinity,
      enhancerAt: Infinity,
    });
    let shots = 0;
    sim.fire = () => {
      shots++;
      return true;
    };
    sim.lineBlocked = () => false;
    let found = false;
    for (let a = 0; a < 8 && !found; a++) {
      for (let b = 0; b < 3; b++) {
        if (GAME_TABLES.ai.aggression[a][b] === f.level) {
          sim.arena = a + 1;
          sim.round = b + 1;
          found = true;
          break;
        }
      }
    }
    for (const [j, step] of f.steps.entries()) {
      sim.elapsed = step.clock - 7;
      sim.time = 100;
      shots = 0;
      q.inactive = !step.active;
      r.aiContact = {
        clear: !step.wall && !step.runner,
        ...(step.wall ? { wall: { x: 1, z: 0 } } : {}),
        ...(step.runner ? { runner: 0 } : {}),
      };
      sim.sceneContacts = (
        _a: any,
        _b: any,
        _source: any,
        target?: Partial<import('../../src/game-types.ts').Runner>,
      ) => {
        if (target) {
          if (target.id === 0 && step.active) {
            return [{ kind: 'runner', runner: 0 }];
          }
          return [];
        }
        if (step.probeWall) {
          return [{ kind: 'wall' }];
        }
        return [];
      };
      const before = sim.events.length;
      sim.ai(r, 1 / 60);
      const nav: import('../../src/game-types.ts').Navigation = r.navigation,
        route = navigationState(sim, r);
      assert.deepEqual(
        {
          mode: { path: 0, attack: 1, recover: 3 }[r.aiState.mode],
          attackAfter: r.aiState.attackAfter,
          recoverUntil: r.aiState.recoverUntil,
          shotAt: r.aiState.shotAt,
          attackCollisions: nav!.attackCollisions,
          pushes: sim.events
            .slice(before)
            .filter((e) => e.type === 'aiBreadcrumb')
            .map((e) => e.next),
          shots,
          current: nav!.segment.startNode,
          next: nav!.segment.endNode,
          chain: route!.temporaryNodes.map((n) => n.id),
          pool: routePoolState(sim).temporaryNodes,
          refreshAt: nav!.refreshAt,
        },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});
