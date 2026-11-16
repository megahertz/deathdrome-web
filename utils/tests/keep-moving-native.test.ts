import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stepKeepMoving } from '../../src/keep-moving.ts';
import { paletteBrightness } from '../../src/palette-brightness.ts';
import { PaletteFlash, flashedPaletteColor } from '../../src/palette-flash.ts';
import { Simulation } from '../../src/simulation.ts';

test('576 original keep-moving traces match gates, history, protected/lethal health, voices, messages and exact kicks', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/keep-moving-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.sequences, 576);
  assert.equal(audit.observations, 2880);
  assert.equal(audit.maximumKickError, 0);
  for (const [i, f] of audit.fixtures.entries()) {
    const sim = new Simulation({
        player: f.variant === 'unselected' ? (f.model + 1) % 8 : f.model,
        maximumRunners: 8,
      }),
      r = sim.runners[f.model];
    Object.assign(sim, {
      multiplayer: f.variant === 'multiplayer',
      invulnerableHuman: f.invulnerable,
    });
    Object.assign(r, {
      health: f.health,
      shield: f.shielded ? 10 : 0,
      lastHitWeaponCode: 99,
      killedByRunner: 0xff_ff_ff_ff,
      profileName: 'PRISONER',
    });
    sim.keepMovingState.timers[f.model] = f.timer;
    sim.keepMovingState.positions[f.model] = {
      x: f.previous[0],
      y: f.previous[1],
      z: f.previous[2],
    };
    sim.keepMovingState.impactVoice = f.voice;
    for (const [j, step] of f.steps.entries()) {
      sim.events = [];
      sim.keepMovingEnabled = step.enabled;
      Object.assign(r, {
        x: step.position[0],
        y: step.position[1],
        z: step.position[2],
        collisionProbe: {
          x: step.probe[0],
          y: step.probe[1],
          z: step.probe[2],
        },
        yaw: (step.yaw * Math.PI) / 180,
        lateralSpeed: step.velocity[0],
        localVerticalSpeed: step.velocity[1],
        speed: -step.velocity[2],
        dead: step.active ? 0 : Infinity,
        inactive: false,
        movementEnabled: step.movement,
      });
      stepKeepMoving(sim, r, step.dt);
      const events = sim.events.flatMap<{
        type: string;
        text?: unknown;
        id?: number;
        point?: number[];
        enabled?: number;
        frames?: number;
      }>((e) => {
        if (e.type === 'keepMoving') {
          return [
            { type: 'sound', id: 74 },
            { type: 'message', text: e.text },
            { type: 'sound', id: e.soundId },
            {
              type: 'impact',
              point: [e.point.x, e.point.y, e.point.z],
              enabled: 1,
            },
          ];
        }
        if (e.type === 'selfKill') {
          return [{ type: 'message', text: e.text }];
        }
        if (e.type === 'paletteFlash') {
          return [{ type: e.type, frames: e.frames }];
        }

        return [];
      });
      assert.deepEqual(
        {
          timer: sim.keepMovingState.timers[f.model],
          previous: Object.values(sim.keepMovingState.positions[f.model]),
          health: r.health,
          voice: sim.keepMovingState.impactVoice,
          velocity: [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
          killer:
            r.killedByRunner === 0xff_ff_ff_ff ? 0xff_ff_ff_ff : f.profile,
          weapon: r.lastHitWeaponCode,
          events,
        },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});
test('palette flash requests and all 61440 uploaded bytes match real original callbacks at every brightness level', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/palette-flash-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.callbacks, 60);
  assert.equal(audit.uploadedBytesCompared, 61_440);
  for (const [i, f] of audit.fixtures.entries()) {
    const flash = new PaletteFlash();
    for (const [j, step] of f.steps.entries()) {
      let upload = null;
      if (step.trigger) {
        flash.trigger();
      } else {
        const amount = flash.frame();
        upload = Array.from({ length: 256 }, (_, index) =>
          paletteBrightness(
            flashedPaletteColor(
              [index, 255 - index, (index * 37) % 256, 0],
              amount,
            ),
            f.level,
          ),
        ).flat();
      }
      assert.deepEqual(
        { active: flash.active, remaining: flash.remaining, upload },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});

test('idle punishment remains exact inside 192 complete original physical callbacks, including the following kick integration', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/keep-moving-physics-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  assert.equal(audit.passed, true);
  assert.equal(audit.updates, 192);
  assert.equal(audit.maximumNumericError, 0);
  for (const [i, f] of audit.fixtures.entries()) {
    const sim = new Simulation({
        player: f.model,
        maximumRunners: 1,
        ground: () => 0,
      }),
      r = sim.runners[f.model];
    sim.countdown = 0;
    Object.assign(r, {
      x: 0,
      y: 0,
      z: 0,
      yaw: (f.yaw * Math.PI) / 180,
      speed: 0,
      lateralSpeed: 0,
      localVerticalSpeed: 0,
      acceleration: 0,
      turn: 0,
      turnAcceleration: 0,
      health: f.health,
      shield: f.shielded ? 10 : 0,
      controlsEnabled: f.controls,
      disableTimer: 2,
      movementEnabled: true,
      actionMode: 1,
      previousActionMode: 1,
      chassisPitchDegrees: 0,
      chassisRollDegrees: 0,
      frontVelocity: 0,
      sideVelocity: 0,
      grounded: true,
      supportContact: true,
      supportBrake: 2,
      slopeImpulse: 0,
      collisionProbe: { x: 0, y: 0, z: 0 },
      rearProbe: { x: 0, y: 0, z: 0 },
      worldVelocity: { x: 0, y: 0, z: 0 },
      vy: 0,
    });
    sim.keepMovingState.timers[f.model] = f.timer;
    sim.keepMovingState.positions[f.model] = { x: 0, y: 0, z: 0 };
    sim.keepMovingState.impactVoice = f.voice;
    sim.stepRunnerWeapons = () => {};
    sim.checkRunnerHealth = () => false;
    for (let j = 0; j < 3; j++) {
      sim.step(f.dt, {
        driveRates: {
          turn: r.turn,
          acceleration: r.acceleration,
          turnAcceleration: r.turnAcceleration,
        },
      });
      assert.deepEqual(
        {
          position: [r.x, r.y, r.z],
          localVelocity: [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
          worldVelocity: Object.values(r.worldVelocity!),
          health: r.health,
          timer: sim.keepMovingState.timers[f.model],
          baseline: Object.values(sim.keepMovingState.positions[f.model]),
          controlsEnabled: r.controlsEnabled,
          disableTimer: r.disableTimer,
          keepMovingSounds: sim.events.filter((e) => e.type === 'keepMoving')
            .length,
        },
        audit.native[i][j],
        `${i}: ${j}`,
      );
    }
  }
});
