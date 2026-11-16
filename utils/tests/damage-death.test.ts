import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { runnerContact } from '../../src/runner-contact.ts';
import { stepSecondaryProjectile } from '../../src/secondary.ts';
import { Simulation } from '../../src/simulation.ts';
import { fixture as stateFixture } from './fixtures.ts';
const report = (name: string) =>
  JSON.parse(
    fs
      .readFileSync(
        new URL(
          '../../private/verification/' + name + '-native-audit.json',
          import.meta.url,
        ),
      )
      .toString(),
  );
test('primary hit, active zero-health Fire and post-weapon death match 64 native traces', () => {
  const a = report('damage-death');
  a.fixtures.forEach(
    (
      f: {
        player: any;
        victim: number;
        health: any;
        shielded: any;
        missile: any;
        dt: number;
      },
      i: number,
    ) => {
      const sim = new Simulation({
        player: f.player,
        ground: () => 0,
        blocked: () => false,
        wallContact: () => null,
      });
      sim.countdown = 0;
      sim.ai = () => ({});
      sim.projectileContact = () => {};
      sim.runners.forEach((r) => (r.dead = Infinity));
      const r = sim.runners[f.victim],
        owner = 1 - f.victim;
      Object.assign(r, {
        dead: 0,
        inactive: false,
        x: 100 + f.victim * 30,
        y: 0,
        z: 100,
        yaw: Math.PI / 4,
        speed: 0,
        health: f.health,
        shield: f.shielded ? 10 : 0,
      });
      sim.events = [];
      const sounds: any[] = [],
        emit = sim.emit.bind(sim);
      sim.emit = (type, data) => {
        if (type === 'shot') {
          sounds.push((data as { soundId: number }).soundId);
        }
        emit(type, data);
      };
      const snapshot = () => ({
        health: r.health,
        shielded: r.shield > 0,
        active: !r.dead,
        kills: sim.runners[owner].kills,
        count: sim.projectiles.filter((p) => p.owner === r.id && p.life > 0)
          .length,
        slots: sim.projectiles
          .filter((p) => p.owner === r.id && p.life > 0)
          .map((p) => ({
            slot: p.slot,
            age: p.age,
            visible: !p.pending && !p.hidden,
          })),
        sounds: [...sounds],
      });
      sim.damage(
        r,
        f.missile ? 140 : 4,
        owner,
        f.missile ? 'Missile' : 'Laser',
        {
          armor: false,
          power: false,
        },
      );
      const samples = [snapshot()];
      sim.fire(r);
      samples.push(snapshot());
      sim.step(f.dt);
      samples.push(snapshot());
      sim.step(f.dt);
      samples.push(snapshot());
      assert.deepEqual(samples, a.native[i]);
    },
  );
});
test('primary/wave/runner hit responses, including already-zero health, match 30 native cases', () => {
  const a = report('hit-responses');
  a.fixtures.forEach(
    (f: { kind: string; health: any; shielded: any }, i: number) => {
      const sim = new Simulation({
        ground: () => 0,
        blocked: () => false,
        wallContact: () => null,
      });
      sim.runners.forEach((r) => (r.dead = Infinity));
      const r = sim.runners[0],
        q = sim.runners[1];
      Object.assign(r, {
        dead: 0,
        inactive: false,
        x: 100,
        y: 0,
        z: 100,
        yaw: 0,
        speed: 75,
        nitro: f.kind === 'Nitro Ram' ? 1 : 0,
      });
      Object.assign(q, {
        dead: 0,
        inactive: false,
        x: 110,
        y: 0,
        z: 100,
        speed: 0,
        health: f.health,
        shield: f.shielded ? 10 : 0,
      });
      sim.score = 0;
      if (f.kind === 'Laser' || f.kind === 'Missile') {
        sim.projectileContact(
          stateFixture<import('../../src/game-types.ts').Projectile>({
            owner: 0,
            kind: f.kind,
            x: 110,
            y: 0,
            z: 100,
            life: 1,
            damage: f.kind === 'Missile' ? 140 : 4,
          }),
          { x: 110, y: 0, z: 100 },
        );
      } else if (f.kind === 'ShockWave') {
        stepSecondaryProjectile(
          sim,
          { owner: 0, kind: f.kind, x: 100, y: 0, z: 100, life: 1, scale: 20 },
          1 / 60,
        );
      } else {
        runnerContact(sim, r, q, { aImpact: true, bImpact: false });
      }
      assert.deepEqual(
        {
          health: q.health,
          active: !q.dead,
          kills: r.kills,
          score: sim.score,
          nitro: r.nitro,
        },
        a.native[i],
      );
    },
  );
});
test('a later victim fires its last volley before death, while an earlier victim waits for its next actor update', () => {
  for (const victim of [0, 1]) {
    const owner = 1 - victim,
      s = new Simulation({
        player: victim,
        ground: () => 0,
        blocked: () => false,
        wallContact: () => null,
      });
    s.countdown = 0;
    s.ai = () => ({ fire: true });
    s.runners.forEach((r) => (r.dead = Infinity));
    for (const id of [0, 1]) {
      Object.assign(s.runners[id], {
        dead: 0,
        inactive: false,
        x: 100 + id * 100,
        y: 0,
        z: 100,
        yaw: 0,
        speed: 0,
      });
    }
    const q = s.runners[victim];
    q.health = 1;
    let hit = false;
    s.projectileContact = (p) => {
      if (p.owner === owner && !hit) {
        hit = true;
        s.damage(q, 4, owner, 'Laser', { armor: false, power: false });
        p.life = 0;
      }
    };
    s.step(1 / 60, { fire: victim === 1 });
    assert.equal(q.health, 0);
    assert.equal(s.runners[owner].kills, 1);
    if (victim === 1) {
      assert.ok(q.dead > 0);
      assert.ok(
        s.events.findIndex((e) => e.type === 'shot' && e.runner === victim) >=
          0,
      );
      assert.ok(
        s.events.findIndex((e) => e.type === 'shot' && e.runner === victim) <
          s.events.findIndex(
            (e) => e.type === 'destroyed' && e.runner === victim,
          ),
      );
    } else {
      assert.equal(q.dead, 0);
      assert.ok(q.pendingDeath);
      s.step(1 / 60, { fire: true });
      assert.ok(q.dead > 0);
      assert.ok(s.events.some((e) => e.type === 'shot' && e.runner === victim));
    }
    assert.ok(
      s.projectiles
        .filter((p) => p.owner === victim)
        .every((p) => p.hidden && !p.pending),
    );
  }
});
test('a second laser stops against an active zero-health target without another hit score', () => {
  const s = new Simulation({
    ground: () => 0,
    blocked: () => false,
    wallContact: () => null,
  });
  s.countdown = 0;
  s.ai = () => ({});
  s.runners.forEach((r) => (r.dead = Infinity));
  const r = s.runners[0],
    q = s.runners[1];
  Object.assign(r, {
    dead: 0,
    inactive: false,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    speed: 0,
  });
  Object.assign(q, {
    dead: 0,
    inactive: false,
    x: 100,
    y: 0,
    z: 91,
    speed: 0,
    health: 1,
  });
  s.step(1 / 60, { fire: true });
  assert.equal(q.health, 0);
  assert.ok(q.dead > 0);
  assert.equal(r.kills, 1);
  assert.equal(s.score, 100);
  assert.equal(s.projectiles.length, 0);
});
