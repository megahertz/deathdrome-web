import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { readControls, KeyPressLatch } from '../../src/input.ts';
import { appendWeapon, resetInventory } from '../../src/inventory.ts';
import { Simulation } from '../../src/simulation.ts';
import { touchWeaponAvailable } from '../../src/touch-controls.ts';
import {
  TouchInput,
  joystickKeys,
  touchedButtons,
  joystickTurnRate,
  joystickSpeedFraction,
} from '../../src/touch-input.ts';
const buttons: import('../../src/touch-types.ts').TouchButton[] = [
  { name: 'JUMP', x: 675, y: 180, radius: 30 },
  { name: 'WEAPON', x: 630, y: 225, radius: 30 },
  { name: 'BARRIER', x: 720, y: 225, radius: 30 },
  { name: 'FIRE', x: 675, y: 270, radius: 30 },
];
function setup() {
  const keys = new Set<string>(),
    vibrations: any[] = [],
    pad = new TouchInput(keys, { vibrate: (ms: any) => vibrations.push(ms) });
  pad.enabled = true;
  pad.setGeometry({ width: 800, radius: 64, buttons });
  return { keys, pad, vibrations };
}
test('floating joystick has a radial 25% dead zone and eight digital directions', () => {
  assert.deepEqual(joystickKeys(16, 0, 64), []);
  assert.deepEqual(joystickKeys(10, 10, 64), []);
  assert.deepEqual(joystickKeys(17, 0, 64), ['ArrowRight']);
  assert.deepEqual(joystickKeys(-30, -30, 64), ['ArrowLeft', 'ArrowUp']);
  const { keys, pad } = setup();
  pad.down(1, 100, 250);
  assert.equal(keys.size, 0);
  pad.move(1, 65, 215);
  assert.equal(readControls(keys).throttle, 1);
  assert.equal(readControls(keys).steer, 1);
  pad.up(1);
  assert.equal(keys.size, 0);
});
test('a second left finger cannot steal or release the floating joystick', () => {
  const { keys, pad } = setup();
  pad.down(1, 100, 250);
  pad.move(1, 100, 200);
  pad.down(2, 200, 200);
  pad.move(2, 240, 240);
  pad.up(2);
  assert.equal(keys.has('ArrowUp'), true);
  assert.equal(pad.stick!.originX, 100);
  pad.up(1);
  assert.equal(keys.size, 0);
});
test('drive, fire and barrier use independent pointer tracks', () => {
  const { keys, pad, vibrations } = setup();
  pad.down(1, 100, 250);
  pad.move(1, 70, 220);
  pad.down(2, 675, 270);
  pad.down(3, 720, 225);
  pad.beforeStep();
  const controls = readControls(keys);
  assert.equal(controls.throttle, 1);
  assert.equal(controls.steer, 1);
  assert.equal(controls.fire, true);
  assert.equal(controls.barrier, true);
  assert.equal(vibrations.length, 1);
  pad.up(2);
  pad.beforeStep();
  assert.equal(readControls(keys).fire, false);
  assert.equal(readControls(keys).barrier, true);
  pad.up(3);
  assert.equal(readControls(keys).barrier, false);
  assert.equal(readControls(keys).throttle, 1);
});
test('sliding switches buttons and a junction presses both contacted circles', () => {
  const { keys, pad } = setup();
  pad.down(1, 720, 225);
  assert.equal(keys.has('ControlLeft'), true);
  pad.move(1, 675, 180);
  pad.beforeStep();
  assert.equal(keys.has('ControlLeft'), false);
  assert.equal(keys.has('Space'), true);
  assert.deepEqual(touchedButtons(652.5, 202.5, 12, 12, buttons), [
    'JUMP',
    'WEAPON',
  ]);
  pad.move(1, 652.5, 202.5, 12, 12);
  pad.beforeStep();
  assert.equal(keys.has('ShiftLeft'), true);
  assert.ok(pad.pointers.get(1)!.buttons.includes('JUMP'));
});
test('barrier stays held until the last owner leaves, including keyboard ownership', () => {
  const { keys, pad } = setup();
  pad.key('ControlLeft', true);
  pad.down(1, 720, 225);
  pad.down(2, 720, 225);
  pad.up(1);
  pad.key('ControlLeft', false);
  assert.equal(keys.has('ControlLeft'), true);
  pad.up(2);
  assert.equal(keys.has('ControlLeft'), false);
});
test('short fire taps survive between frames; hold never repeats and two quick presses have a release frame', () => {
  const { keys, pad } = setup();
  pad.down(1, 675, 270);
  pad.up(1);
  pad.down(2, 675, 270);
  pad.up(2);
  const states = [];
  for (let i = 0; i < 5; i++) {
    pad.beforeStep();
    states.push(readControls(keys).fire);
  }
  assert.deepEqual(states, [true, false, true, false, false]);
  pad.down(3, 675, 270);
  const latch = new KeyPressLatch('AltLeft');
  let shots = 0;
  for (let i = 0; i < 12; i++) {
    pad.beforeStep();
    if (latch.step(keys)) {
      shots++;
    }
  }
  assert.equal(shots, 1);
  pad.up(3);
  pad.beforeStep();
  assert.equal(keys.has('AltLeft'), false);
});
test('weapon selection uses the shared key Set and Shift latch for touch and fast keyboard taps', () => {
  const { keys, pad } = setup(),
    latch = new KeyPressLatch('ShiftLeft', 'ShiftRight'),
    sim = new Simulation(),
    r = sim.runners[0];
  r.weapons = [null, 'Missile', 'Ion Sword'];
  const step = () => {
    pad.beforeStep();
    if (latch.step(keys)) {
      sim.cycleWeapon(r);
    }
  };
  pad.down(1, 630, 225);
  pad.up(1);
  step();
  assert.equal(r.weapon, 'Missile');
  step();
  pad.key('ShiftRight', true);
  pad.key('ShiftRight', false);
  step();
  assert.equal(r.weapon, 'Ion Sword');
  step();
  assert.equal(r.weapon, 'Ion Sword');
});
test('actual simulation fires once per touch press through existing Alt input', () => {
  const { keys, pad } = setup(),
    sim = new Simulation({ maximumRunners: 1, ground: () => 0 });
  sim.countdown = 0;
  sim.projectileContact = () => {};
  const step = () => {
    pad.beforeStep();
    sim.step(1 / 60, readControls(keys));
  };
  pad.down(1, 675, 270);
  for (let i = 0; i < 8; i++) {
    step();
  }
  assert.equal(sim.projectiles.length, 2);
  pad.up(1);
  step();
  pad.down(2, 675, 270);
  step();
  assert.equal(sim.projectiles.length, 4);
});
test('cancel and reset discard pending actions and disabled controls ignore new touches', () => {
  const { keys, pad } = setup();
  pad.down(1, 675, 270);
  pad.cancel(1);
  pad.beforeStep();
  assert.equal(keys.size, 0);
  pad.down(2, 675, 180);
  pad.key('ArrowUp', true);
  pad.reset({ keyboard: true });
  pad.beforeStep();
  assert.equal(keys.size, 0);
  assert.equal(pad.stick, null);
  assert.equal(pad.pointers.size, 0);
  pad.enabled = false;
  assert.equal(pad.down(3, 675, 270), false);
});
test('right-side blank drags do not create driving, braking, look or rear-view inputs', () => {
  const { keys, pad } = setup();
  pad.down(1, 500, 100);
  pad.move(1, 510, 110);
  assert.equal(keys.size, 0);
  assert.deepEqual(readControls(keys), readControls(new Set<string>()));
  pad.move(1, 200, 120);
  assert.equal(keys.size, 0);
  pad.up(1);
});
test('small sideways deflection gives a small ongoing turn and centering does not return to an old heading', () => {
  const run = (dx: number) => {
    const sim = new Simulation({ maximumRunners: 1, ground: () => 0 }),
      r = sim.runners[0],
      keys = new Set<string>();
    sim.countdown = 0;
    sim.regions = { maskAt: () => 1 };
    Object.assign(r, {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      movementEnabled: true,
    });
    const pad = new TouchInput(keys, { getPose: () => r });
    pad.enabled = true;
    pad.setGeometry({ width: 800, radius: 64, buttons: [] });
    pad.down(1, 100, 250);
    pad.move(1, 100 + dx, 194);
    let heading1;
    for (let i = 0; i < 120; i++) {
      pad.beforeStep();
      sim.step(1 / 60, readControls(keys));
      if (i === 59) {
        heading1 = (r.yaw * 180) / Math.PI;
      }
    }
    const heading2 = (r.yaw * 180) / Math.PI;
    pad.move(1, 100, 194);
    assert.equal(keys.has('ArrowLeft') || keys.has('ArrowRight'), false);
    for (let i = 0; i < 120; i++) {
      pad.beforeStep();
      sim.step(1 / 60, readControls(keys));
    }
    const afterCenter = (r.yaw * 180) / Math.PI;
    pad.up(1);
    assert.equal(keys.size, 0);
    return { heading1, heading2, afterCenter };
  };
  const small = run(8),
    medium = run(16),
    full = run(64);
  assert.ok(Math.abs(small.heading1!) < 5 && small.heading1! < 0);
  assert.ok(small.heading2 < small.heading1! - 2);
  assert.ok(
    small.afterCenter <= small.heading2 &&
      Math.abs(small.afterCenter - small.heading2) < 1,
  );
  assert.ok(Math.abs(medium.heading1!) > Math.abs(small.heading1!) * 2);
  assert.ok(Math.abs(full.heading1!) > 90);
  assert.equal(joystickTurnRate(0, 64, 185), 0);
});
test('a picked-up secondary brightens WEAPON even while the laser remains selected', () => {
  const sim = new Simulation(),
    r = sim.runners[0];
  assert.equal(touchWeaponAvailable(r.weapons), false);
  appendWeapon(r, 'Missile');
  assert.equal(r.weapon, null);
  assert.equal(touchWeaponAvailable(r.weapons), true);
  resetInventory(r);
  assert.equal(touchWeaponAvailable(r.weapons), false);
});
test('small tilt crawls, deeper tilt increases speed, and full tilt matches every vehicle keyboard cap in both directions', () => {
  const run = (model: number, strength: number, direction: number) => {
    const sim = new Simulation({
        player: model,
        maximumRunners: 1,
        ground: () => 0,
      }),
      r = sim.runners[model],
      keys = new Set<string>();
    sim.countdown = 0;
    sim.regions = { maskAt: () => 1 };
    Object.assign(r, {
      x: 0,
      y: 0,
      z: 0,
      speed: 0,
      yaw: 0,
      movementEnabled: true,
    });
    const pad = new TouchInput(keys, { getPose: () => r });
    pad.enabled = true;
    pad.setGeometry({ width: 800, radius: 64, buttons: [] });
    pad.down(1, 100, 250);
    pad.move(1, 100, 250 - direction * strength * 64);
    for (let i = 0; i < 180; i++) {
      pad.beforeStep();
      sim.step(1 / 60, readControls(keys));
    }
    pad.up(1);
    assert.equal(keys.size, 0);
    return r.speed * direction;
  };
  for (let model = 0; model < 8; model++) {
    for (const direction of [-1, 1]) {
      const max = GAME_TABLES.runners[model].maxSpeed,
        slow = run(model, 0.26, direction),
        medium = run(model, 0.6, direction),
        full = run(model, 0.75, direction);
      assert.ok(slow > 0 && slow < max * 0.06, `${model}: crawl ${slow}`);
      assert.ok(
        medium > slow * 3 && medium < max * 0.65,
        `${model}: medium ${medium}`,
      );
      assert.equal(full, max, `${model}: full tilt`);
    }
  }
});
test('full throttle needs 25% less travel while the dead zone and low-speed range stay unchanged', () => {
  for (const radius of [56, 64, 92]) {
    for (const travel of [0, 0.1, 0.25, 0.26, 0.3, 0.4, 0.5]) {
      assert.ok(
        Math.abs(
          joystickSpeedFraction(travel * radius, radius) -
            Math.max(0, (travel - 0.25) / 0.75),
        ) < 1e-12,
      );
    }
    assert.ok(joystickSpeedFraction(0.74 * radius, radius) < 1);
    for (const travel of [0.75, 0.8, 1, 2]) {
      assert.equal(joystickSpeedFraction(travel * radius, radius), 1);
    }
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const speed = joystickSpeedFraction((i * radius) / 1000, radius);
      assert.ok(speed >= previous && speed <= 1);
      previous = speed;
    }
  }
});
