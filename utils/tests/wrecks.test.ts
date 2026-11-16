import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Simulation } from '../../src/simulation.ts';
import { Wrecks, WRECK } from '../../src/wrecks.ts';
import { fixture as stateFixture } from './fixtures.ts';

test('wreck constants and all debris attachments come from the supplied original', async () => {
  const exe = await readFile(
      new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
    ),
    data = (va: number) => va - 0x480000 + 0x68e00,
    code = (va: number) => va - 0x410000 + 0x400;
  assert.equal(WRECK.respawnSeconds, exe.readFloatLE(code(0x42b0a7)));
  assert.equal(WRECK.horizontalVelocity, exe.readFloatLE(code(0x43f082)));
  assert.equal(WRECK.verticalVelocity, exe.readFloatLE(code(0x43f090)));
  assert.equal(WRECK.bodyDelay, exe.readFloatLE(data(0x48573c)));
  assert.equal(
    WRECK.horizontalDeceleration,
    -exe.readDoubleLE(data(0x485744)) * 0.5,
  );
  assert.equal(
    WRECK.verticalDeceleration,
    -exe.readDoubleLE(data(0x485750)) * 0.5,
  );
  assert.equal(WRECK.bodyHitScore, exe.readUInt32LE(code(0x435f8a)));
  for (let i = 0; i < 8; i++) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const model = JSON.parse(
      (
        await readFile(
          new URL(
            `../../private/assets/models/runrex_${i}.json`,
            import.meta.url,
          ),
        )
      ).toString(),
    );
    // oxlint-enable no-await-in-loop
    assert.ok(WRECK.runners[i].parts.length >= 6);
    assert.ok(WRECK.runners[i].parts.length <= 10);
    for (const p of WRECK.runners[i].parts) {
      assert.deepEqual(p.matrix, model.attachments[p.name].matrix);
      assert.ok(
        model.meshes.some((m: { name: string | string[] }) =>
          m.name.includes('/' + p.name + '/'),
        ),
      );
    }
  }
});

test('native debris directions and half-gravity preserve the first update displacement', () => {
  const wrecks = new Wrecks(),
    w = wrecks.create({ id: 0, x: 10, y: 0, z: 20, yaw: 0 }, 0, () => 0),
    p = w.parts[0],
    spec = WRECK.runners[0].parts[0],
    dt = 1 / 60;
  wrecks.step(
    dt,
    () => 0,
    () => 0.5,
  );
  const angle = (spec.angleDegrees * Math.PI) / 180;
  assert.ok(Math.abs(p.x - (32 * Math.sin(angle) * dt - 15 * dt * dt)) < 1e-12);
  assert.ok(
    Math.abs(
      p.z -
        (32 * Math.cos(angle) * (1 - spec.verticalFactor) * dt - 15 * dt * dt),
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(p.y - (37.5 * spec.verticalFactor * dt - 29.85 * dt * dt)) < 1e-12,
  );
  assert.equal(p.horizontal, 31.75);
  assert.equal(p.scale, 1);
});

test('respawning a live runner leaves the wreck at the death position', () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  s.runners.forEach((r) => (r.dead = Infinity));
  const r = s.runners[0];
  Object.assign(r, { dead: 0, x: 100, y: 0, z: 100 });
  s.damage(r, 10000, 1);
  s.checkRunnerHealth(r);
  const w = s.wrecks.states[0];
  for (let i = 0; i < 151; i++) {
    s.step(1 / 60);
  }
  assert.ok(r.respawn);
  for (let i = 0; i < 50; i++) {
    s.step(1 / 60);
  }
  assert.equal(r.dead, 0);
  assert.equal(r.health, 100);
  assert.equal(s.wrecks.states[0], w);
  assert.equal(w.x, 100);
  assert.equal(w.z, 100);
  assert.notEqual(r.x, w.x);
  Object.assign(r, { x: 200, z: 200 });
  s.damage(r, 10000, 1);
  s.checkRunnerHealth(r);
  assert.notEqual(s.wrecks.states[0], w);
  assert.equal(s.wrecks.states[0].x, 200);
});

test('body appears on one random outcome and a projectile earns its bonus once', () => {
  const s = new Simulation();
  s.countdown = 0;
  s.ai = () => ({});
  s.runners.forEach((r) => (r.dead = Infinity));
  Object.assign(s.runners[0], { dead: 0, x: 200, y: 10, z: 200 });
  const q = s.runners[1];
  Object.assign(q, { dead: 0, x: 100, y: 0, z: 100 });
  s.damage(q, 10000, 0);
  s.checkRunnerHealth(q);
  const w = s.wrecks.states[1];
  for (let i = 0; i < 91; i++) {
    s.wrecks.step(
      1 / 60,
      () => 0,
      () => 0,
    );
  }
  assert.equal(w.body.visible, true);
  const body = s.wrecks.bodyPosition(w);
  const shot = stateFixture<import('../../src/game-types.ts').Projectile>({
    kind: 'Laser',
    owner: 0,
    x: body.x,
    y: body.y + 1,
    z: body.z,
    dx: 0,
    dy: 0,
    dz: 0,
    speed: 0,
    life: 1,
    damage: 4,
  });
  s.projectiles = [
    stateFixture<import('../../src/game-types.ts').Projectile>({ ...shot }),
    stateFixture<import('../../src/game-types.ts').Projectile>({ ...shot }),
  ];
  s.step(1 / 60);
  assert.equal(s.score, 1000);
  assert.equal(w.body.hit, true);
  assert.equal(w.body.visible, false);
  assert.equal(s.events.filter((e) => e.type === 'bodyHit').length, 1);
  const empty = new Wrecks(),
    v = empty.create({ id: 0, x: 0, y: 0, z: 0, yaw: 0 }, 0, () => 0);
  for (let i = 0; i < 91; i++) {
    empty.step(
      1 / 60,
      () => 0,
      () => 1,
    );
  }
  assert.equal(v.body.visible, false);
});
