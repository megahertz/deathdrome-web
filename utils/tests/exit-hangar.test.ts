import assert from 'node:assert/strict';
import test from 'node:test';
import { beginOpponentExit, beginEscape } from '../../src/escape.ts';
import { stepExitHangar } from '../../src/exit-hangar.ts';
import { View } from '../../src/renderer.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';

test('exit hangar waits through delay, opens during centering and closes after concurrent exits finish', () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  s.time = 34;
  Object.assign(s.runners[0], { x: 100, y: 0, z: 100 });
  for (const id of [1, 2]) {
    const r = s.runners[id];
    Object.assign(r, { x: 0, y: 0, z: 0, kills: s.requiredKills });
    beginOpponentExit(s, r);
  }
  for (let i = 0; i < 16; i++) {
    s.step(1 / 60);
  }
  assert.deepEqual(s.exitHangar, { door: 0, sign: 0, moving: false });
  s.step(1 / 60);
  assert.ok(s.exitHangar.door > 0);
  assert.ok(s.exitHangar.sign > 0);
  for (let i = 0; i < 100; i++) {
    s.step(1 / 60);
  }
  assert.ok(s.exitHangar.door >= 21);
  assert.ok(s.runners[1].opponentExit);
  assert.ok(s.runners[2].opponentExit);
  const height = s.exitHangar.door;
  s.step(1 / 60);
  assert.equal(
    s.exitHangar.door,
    height,
    'height test preserves the native overshoot',
  );
  for (let i = 0; i < 400; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.runners[1].opponentExit, null);
  assert.equal(s.runners[2].opponentExit, null);
  assert.deepEqual(s.exitHangar, { door: 0, sign: 0, moving: false });
});
test('human exit advances shared hangar during its separate exit phase', () => {
  const s = new Simulation();
  beginEscape(s, s.runners[0]);
  for (let i = 0; i < 80; i++) {
    s.step(1 / 60);
  }
  assert.equal(s.phase, 'exiting');
  assert.ok(s.exitHangar.door > 17);
  assert.ok(s.exitHangar.sign > 5);
});
test('native closing threshold snaps both moving pieces instead of overshooting below ground', () => {
  const s = stateFixture<import('../../src/simulation.ts').Simulation>({
    exitHangar: { door: 0.2, sign: 0.05, moving: true },
    runners: [],
  });
  stepExitHangar(s, 1 / 60);
  assert.deepEqual(s.exitHangar, { door: 0, sign: 0, moving: false });
});
test('exit tube visibility follows the human exit action while hangar pieces retain independent offsets', () => {
  const view = {
      exitGroup: { visible: false },
      hangarParts: {
        door: {
          position: {} as Partial<import('../../src/game-types.ts').Vec3>,
        },
        sign: {
          position: {} as Partial<import('../../src/game-types.ts').Vec3>,
        },
      },
      arenaGroup: { updateMatrixWorld() {} },
      setExitHangar: View.prototype.setExitHangar,
    },
    sim = stateFixture<import('../../src/simulation.ts').Simulation>({
      exitHangar: { door: 21, sign: 6.36 },
    });
  View.prototype.syncExit.call(view, sim);
  assert.equal(view.exitGroup.visible, false);
  assert.equal(view.hangarParts.door.position.y, 21);
  assert.equal(view.hangarParts.sign.position.y, 6.36);
  sim.escape = { phase: 'delay' } as typeof sim.escape;
  View.prototype.syncExit.call(view, sim);
  assert.equal(view.exitGroup.visible, false);
  sim.escape!.phase = 'center';
  View.prototype.syncExit.call(view, sim);
  assert.equal(view.exitGroup.visible, true);
});
