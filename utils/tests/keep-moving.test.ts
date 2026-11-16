import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKeepMovingState,
  stepKeepMoving,
} from '../../src/keep-moving.ts';
import {
  PaletteBrightness,
  paletteBrightness,
} from '../../src/palette-brightness.ts';
import { PaletteFlash, flashedPaletteColor } from '../../src/palette-flash.ts';
import { Simulation } from '../../src/simulation.ts';

function stopped({ health = 100, shield = 0, controlsEnabled = true } = {}) {
  const sim = new Simulation({ player: 0, maximumRunners: 1, ground: () => 0 }),
    r = sim.runners[0];
  sim.countdown = 0;
  Object.assign(r, {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    lateralSpeed: 0,
    localVerticalSpeed: 0,
    health,
    shield,
    movementEnabled: true,
    controlsEnabled,
    forwardVector: { x: 0, y: 0, z: -1 },
    planarForwardVector: { x: 0, z: -1 },
    collisionProbe: { x: 0, y: 0, z: -8 },
  });
  sim.keepMovingState.timers[0] = Math.fround(10 - Math.fround(1 / 60));
  return { sim, r };
}
test('idle punishment occurs after physical support and before primary weapons and delayed destruction', () => {
  const { sim, r } = stopped({ health: 0.1 }),
    order: {
      runner: number | undefined;
      health: number | undefined;
      dead: any;
      speed: number | undefined;
    }[] = [];
  const weapons = sim.stepRunnerWeapons.bind(sim);
  sim.stepRunnerWeapons = (runner, dt, ...rest) => {
    order.push({
      runner: runner.id,
      health: runner.health,
      dead: runner.dead,
      speed: runner.speed,
    });
    return weapons(runner, dt, ...rest);
  };
  sim.step(1 / 60, { fire: true });
  assert.equal(order[0].health, 0);
  assert.equal(order[0].dead, 0);
  assert.ok(order[0].speed! < 0);
  assert.ok(r.dead > 0);
  assert.equal(sim.lives, 3);
  assert.equal(sim.score, 0);
  assert.equal(r.kills, 0);
  assert.deepEqual(
    sim.events
      .filter((e) =>
        ['keepMoving', 'selfKill', 'paletteFlash', 'destroyed'].includes(
          e.type,
        ),
      )
      .map((e) => e.type),
    ['keepMoving', 'selfKill', 'paletteFlash', 'destroyed'],
  );
  const death = sim.events.find((e) => e.type === 'destroyed');
  assert.equal(death.reason, 'keepMoving');
  assert.equal(death.owner, 0);
  assert.equal(death.weapon, 'Laser');
});
test('a shield blocks only idle damage; disabled controls still receive the original kick and warning', () => {
  const { sim, r } = stopped({ shield: 10, controlsEnabled: false });
  sim.step(1 / 60);
  assert.equal(r.health, 100);
  assert.equal(r.dead, 0);
  assert.ok(r.speed < 0);
  assert.ok(r.lateralSpeed > 0);
  assert.ok(sim.events.some((e) => e.type === 'keepMoving'));
  assert.ok(sim.events.some((e) => e.type === 'paletteFlash'));
});
test('materialization and domain replacement retain per-model history while a new runtime state starts cold', () => {
  const state = createKeepMovingState(),
    sim = new Simulation({ keepMovingState: state, maximumRunners: 1 }),
    r = sim.runners[0];
  state.timers[0] = 7;
  state.positions[0] = { x: 12, y: 34, z: 56 };
  state.impactVoice = 7;
  sim.spawn(r);
  assert.equal(state.timers[0], 7);
  assert.deepEqual(state.positions[0], { x: 12, y: 34, z: 56 });
  const next = new Simulation({ arena: 2, keepMovingState: state });
  assert.equal(next.keepMovingState, state);
  assert.equal(next.keepMovingState.impactVoice, 7);
  assert.equal(new Simulation().keepMovingState.timers[0], 0);
});
test('moving more than three units advances the baseline without punishment; exactly three and vertical travel do not escape it', () => {
  const { sim, r } = stopped();
  r.x = 3.001;
  assert.equal(stepKeepMoving(sim, r, 1 / 60), false);
  assert.equal(sim.keepMovingState.timers[0], 0);
  assert.equal(r.health, 100);
  const previous = sim.keepMovingState.positions[0];
  sim.keepMovingState.timers[0] = 9;
  r.x = previous.x;
  r.y = 100;
  assert.equal(stepKeepMoving(sim, r, 1), true);
  assert.equal(sim.keepMovingState.positions[0].y, 100);
});
test('flash clamps source palette before brightness adjustment, preserves alpha, and ignores busy retriggers', () => {
  assert.deepEqual(
    paletteBrightness(flashedPaletteColor([250, 2, 120, 123], 70), 0),
    [223, 40, 158, 123],
  );
  const flash = new PaletteFlash();
  assert.equal(flash.trigger(), true);
  assert.equal(flash.frame(), 70);
  assert.equal(flash.trigger(), false);
  assert.equal(flash.frame(), 140);
  assert.equal(flash.trigger(), false);
  assert.equal(flash.frame(), 0);
  assert.equal(flash.trigger(), true);
});
test('production filter composes flash before brightness and removes itself after restoration', () => {
  const node = (name: string) => ({
      name,
      attributes: {} as Record<string, string>,
      children: [] as { attributes: Record<string, string>; children: any[] }[],
      style: {},
      setAttribute(k: string | number, v: any) {
        this.attributes[k as keyof typeof this.attributes] = v;
      },
      append(...v: any[]) {
        this.children.push(...v);
      },
      remove() {},
    }),
    doc = {
      createElementNS: (_: any, name: string) => node(name),
      body: node('body'),
    },
    target = { ownerDocument: doc, style: {} as CSSStyleDeclaration };
  const brightness = new PaletteBrightness(target as unknown as HTMLElement);
  brightness.setLevel(0);
  brightness.setFlash(70);
  const filter = brightness.svg.children[0].children[0];
  assert.equal(filter.attributes['color-interpolation-filters'], 'sRGB');
  assert.equal(filter.children.length, 2);
  assert.ok(Number(filter.children[0].children[0].attributes.intercept) > 0);
  assert.ok(Number(filter.children[1].children[0].attributes.intercept) < 0);
  assert.match(target.style.filter, /url/);
  brightness.setLevel(4);
  brightness.setFlash(0);
  assert.equal(target.style.filter, 'none');
});
