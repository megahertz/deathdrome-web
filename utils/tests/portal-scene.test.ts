import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { portalLocked } from '../../src/portal-doors.ts';
import { View, THREE, makeArenaGeometry } from '../../src/renderer.ts';
import { Simulation } from '../../src/simulation.ts';

async function arenaView(arena: number) {
  const data = JSON.parse(
    (
      await readFile(
        new URL(
          `../../private/assets/models/arena${arena}.json`,
          import.meta.url,
        ),
      )
    ).toString(),
  );
  // Retain source geometry and contact flags; textures are irrelevant to queries.
  data.meshes = data.meshes.map((f: any) => ({
    ...f,
    texture: null,
    cycle: null,
  }));
  const view: View = Object.assign(
    Object.create(View.prototype),
    makeArenaGeometry(data),
    { ray: new THREE.Raycaster(), collisionMaterials: new Map() },
  );
  view.arenaGroup.traverse(
    (o: import('../../src/model-types.ts').RenderNode) => {
      if (o.material) {
        view.collisionMaterials.set(o.material, o.material.side);
      }
    },
  );
  view.arenaGroup.updateMatrixWorld(true);
  return { view, data };
}
function setup(view: View, arena: number, round: number) {
  view.configurePortals(round);
  const sim = new Simulation({
    arena,
    round,
    ground: view.ground.bind(view),
    sceneSweep: (a: any, b: any) => view.sweepContacts(a, b),
    updatePortal: (id: any, h: any) => view.setPortalHeight(id, h),
  });
  sim.countdown = 0;
  sim.runners.forEach((r) => (r.dead = Infinity));
  return sim;
}
test('stationary portal thresholds in every decoded arena retain their identities and open only in allowed rounds', async () => {
  let thresholds = 0;
  for (let arena = 1; arena <= 8; arena++) {
    // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const { view, data } = await arenaView(arena),
      candidates = new Map();
    for (const f of data.meshes) {
      const id = f.name.match(/\/port(\d\d)\//i)?.[1];
      if (
        !id ||
        candidates.has(id) ||
        /\/(open|lock)\d\d\//i.test(f.name) ||
        !f.altitude
      ) {
        continue;
      }
      const center = f.v.reduce(
          (p: number[], v: { [x: string]: number }) =>
            p.map((x, i) => x + v[i] / f.v.length),
          [0, 0, 0],
        ),
        hits = view.ground(center[0], center[2], center[1] + 2, true);
      if (
        hits.some(
          (h: { portal: any; height: number }) =>
            h.portal === id && Math.abs(h.height - center[1]) < 0.2,
        )
      ) {
        candidates.set(id, center);
      }
    }
    assert.ok(candidates.size > 0, `arena ${arena}: actual threshold geometry`);
    for (const [id, center] of candidates) {
      for (let round = 1; round <= 3; round++) {
        // Put the front support point on the threshold, as native 435500 uses that
        // list rather than the actor center, side probe or physical wall records.
        const sim = setup(view, arena, round),
          r = sim.runners[0],
          pose = { x: center[0], y: center[1], z: center[2] + 8, yaw: 0 };
        // This is a stationary support-identity check. The arbitrary heading may
        // put the center across a wall; actual approaches run in the scene audit.
        sim.sceneSweep = () => [];
        Object.assign(r, pose, {
          dead: 0,
          movementEnabled: true,
          previousPosition: { ...pose },
          collisionProbe: { ...pose },
          rearProbe: { ...pose },
        });
        sim.step(1 / 60);
        assert.equal(
          (sim.portals.doors.get(id)?.height ?? 0) > 0,
          !portalLocked(id, round),
          `arena ${arena}, round ${round}, threshold ${id}`,
        );
        thresholds++;
      }
    }
    view.arenaGroup.traverse(
      (o: import('../../src/model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      },
    );
  }
  assert.ok(thresholds > 100, `${thresholds} real threshold / round cases`);
});
test('support contact opens once per actor and rejects a different floor more than nine units away', () => {
  for (const height of [0, 9, 9.01, 30]) {
    const sim = new Simulation({
      ground: ((_x: any, _z: any, _y: any, support: any) =>
        support
          ? [{ height, normal: { x: 0, y: 1, z: 0 }, portal: '11' }]
          : height) as import('../../src/game-types.ts').GroundQuery,
    });
    sim.countdown = 0;
    sim.runners.forEach((r) => (r.dead = Infinity));
    Object.assign(sim.runners[0], { x: 100, y: 0, z: 100, dead: 0 });
    sim.step(1 / 60);
    assert.equal(sim.portals.doors.get('11')?.height ?? 0, height <= 9 ? 1 : 0);
  }
});
test('barred THE INFERNO gate diagnostic approaches its full panel rather than an end cap', async () => {
  const { view } = await arenaView(5);
  view.configurePortals(1);
  const pose = view.portalApproach('11');
  assert.ok(Math.abs(Math.sin(pose!.yaw)) > 0.99);
  assert.ok(pose!.z > -33 && pose!.z < 1);
  view.arenaGroup.traverse(
    (o: import('../../src/model-types.ts').RenderNode) => {
      o.geometry?.dispose();
      o.material?.dispose();
    },
  );
});
test('a portal is activated by front support, while wall/center/side-only contacts leave it closed', () => {
  for (const source of ['front', 'center', 'side', 'wall']) {
    const sim = new Simulation({
      ground: ((x: number, z: number, _y: any, support: any) =>
        support
          ? [
              {
                height: 0,
                normal: { x: 0, y: 1, z: 0 },
                portal:
                  (source === 'front' && z === 92) ||
                  (source === 'center' && x === 100 && z === 100) ||
                  (source === 'side' && x > 100 && z === 100)
                    ? '11'
                    : null,
              },
            ]
          : 0) as import('../../src/game-types.ts').GroundQuery,
      sceneSweep: () =>
        source === 'wall'
          ? [
              {
                node: { name: 'wall', children: [] },
                portal: '11',
                point: { x: 100, y: 0, z: 95 },
                normal: { x: 0, y: 1, z: 0 },
              },
            ]
          : [],
    });
    sim.countdown = 0;
    sim.runners.forEach((r) => (r.dead = Infinity));
    const r = sim.runners[0],
      pose = { x: 100, y: 0, z: 100, yaw: 0 };
    Object.assign(r, pose, {
      dead: 0,
      movementEnabled: true,
      previousPosition: { ...pose },
      collisionProbe: { ...pose },
      rearProbe: { ...pose },
    });
    sim.step(1 / 60);
    assert.equal(
      sim.portals.doors.get('11')?.height ?? 0,
      source === 'front' ? 1 : 0,
      source,
    );
  }
});
test('altitude queries reject ceilings and retain steep upward slopes as in native 46b688', () => {
  const data = {
    meshes: [
      {
        name: 'floor',
        v: [
          [0, 2, 0],
          [0, 2, 10],
          [10, 2, 10],
          [10, 2, 0],
        ],
      },
      {
        name: 'ceiling',
        v: [
          [0, 7, 0],
          [10, 7, 0],
          [10, 7, 10],
          [0, 7, 10],
        ],
      },
      {
        name: 'steep',
        v: [
          [20, 0, 0],
          [20, 100, 10],
          [30, 100, 10],
          [30, 0, 0],
        ],
      },
    ].map((f) => ({ ...f, v: f.v.map((p) => [...p, 0, 0]) })),
  };
  const view: View = Object.assign(
    Object.create(View.prototype),
    makeArenaGeometry(
      data as unknown as import('../../src/model-types.ts').ModelData,
    ),
    { ray: new THREE.Raycaster(), collisionMaterials: new Map() },
  );
  view.arenaGroup.traverse(
    (o: import('../../src/model-types.ts').RenderNode) => {
      if (o.material) {
        view.collisionMaterials.set(o.material, o.material.side);
      }
    },
  );
  view.arenaGroup.updateMatrixWorld(true);
  assert.equal(
    view.ground(5, 5),
    2,
    'the underside of the ceiling must not replace the floor',
  );
  const slope = view.ground(25, 5, 200, true);
  assert.equal(slope[0].height, 50);
  assert.ok(
    slope[0].normal.y > 0 && slope[0].normal.y < 0.45,
    'steep valid support',
  );
  view.arenaGroup.traverse(
    (o: import('../../src/model-types.ts').RenderNode) => {
      o.geometry?.dispose();
      o.material?.dispose();
    },
  );
});
test('both THE WALL approaches reproduce original physical and portal actions for 180 frames', async () => {
  const audit = JSON.parse(
      (
        await readFile(
          new URL(
            '../../private/verification/portal-contact-native.json',
            import.meta.url,
          ),
        )
      ).toString(),
    ),
    cases = audit.results.filter((r: { arena: number }) => r.arena === 6);
  assert.equal(cases.length, 2);
  for (const fixture of cases) {
    // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const { view } = await arenaView(6),
      sim = setup(view, 6, 1),
      r = sim.runners[0],
      p = fixture.initial.position,
      pose = {
        x: p[0],
        y: p[1],
        z: p[2],
        yaw: (fixture.initial.yaw * Math.PI) / 180,
      };
    Object.assign(r, pose, {
      dead: 0,
      inactive: false,
      movementEnabled: true,
      shield: 100,
      collisionProbe: { ...pose },
      rearProbe: { ...pose },
      previousPosition: { ...pose },
    });
    sim.portals.update = (id: any, h: any) => view.setPortalHeight(id, h);
    for (const [frame, sample] of fixture.samples.entries()) {
      sim.step(Math.fround(1 / 60), { throttle: 1 });
      assert.deepEqual(
        [r.x, r.y, r.z],
        sample.native.position,
        `side ${fixture.side}, frame ${frame}`,
      );
      assert.equal(
        sim.portals.doors.get('11')?.height ?? 0,
        sample.nativeHeight,
        `lift side ${fixture.side}, frame ${frame}`,
      );
    }
    view.arenaGroup.traverse(
      (o: import('../../src/model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      },
    );
  }
});
test('THE WALL local approaches match 240 physical updates with independent native grid and hierarchy queries', async () => {
  const audit = JSON.parse(
    (
      await readFile(
        new URL(
          '../../private/verification/wall-portal-hierarchy-native.json',
          import.meta.url,
        ),
      )
    ).toString(),
  );
  assert.equal(audit.passed, true);
  for (const fixture of audit.results) {
    // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const data = JSON.parse(
      (
        await readFile(
          new URL('../../private/assets/models/arena6.json', import.meta.url),
        )
      ).toString(),
    );
    // oxlint-enable no-await-in-loop
    data.meshes = data.meshes
      .filter((f: { name: string | string[] }) =>
        f.name.includes('/' + audit.subtree + '/'),
      )
      .map((f: any) => ({ ...f, texture: null, cycle: null }));
    data.collisionBoxes = [];
    const view: View = Object.assign(
      Object.create(View.prototype),
      makeArenaGeometry(data),
      { ray: new THREE.Raycaster(), collisionMaterials: new Map() },
    );
    view.arenaGroup.updateMatrixWorld(true);
    const sim = setup(view, 6, 1),
      r = sim.runners[0],
      p = fixture.initial.position,
      pose = {
        x: p[0],
        y: p[1],
        z: p[2],
        yaw: (fixture.initial.yaw * Math.PI) / 180,
      };
    Object.assign(r, pose, {
      dead: 0,
      inactive: false,
      movementEnabled: true,
      shield: 100,
      collisionProbe: { ...pose },
      rearProbe: { ...pose },
      previousPosition: { ...pose },
    });
    for (const [frame, sample] of fixture.samples.entries()) {
      sim.step(Math.fround(1 / 60), { throttle: 1 });
      assert.deepEqual(
        [r.x, r.y, r.z],
        sample.native.position,
        `native hierarchy side ${fixture.side}, frame ${frame}`,
      );
      assert.equal(
        sim.portals.doors.get('11')?.height ?? 0,
        sample.nativeHeight,
        `native hierarchy lift side ${fixture.side}, frame ${frame}`,
      );
    }
    view.arenaGroup.traverse(
      (o: import('../../src/model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      },
    );
  }
});
test('THE WALL approaches match 240 original updates after native loading of the complete arena and external models', async () => {
  const audit = JSON.parse(
    (
      await readFile(
        new URL(
          '../../private/verification/gamegen-wall-native.json',
          import.meta.url,
        ),
      )
    ).toString(),
  );
  const hash = (
    bytes: string | NonSharedBuffer | NodeJS.ArrayBufferView<ArrayBufferLike>,
  ) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    hash(
      await readFile(
        new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
      ),
    ),
    audit.sha256,
  );
  for (const file of audit.loading.files) {
    assert.equal(
      hash(
        // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
        await readFile(
          new URL(
            '../../' + file.source.replace(/^original\//, 'private/original/'),
            import.meta.url,
          ),
        ),
      ),
      file.sha256,
      file.source,
    );
  }
  const templates = audit.loading.files.filter((f: { source: string }) =>
    /HOTSPOT[123]\.GAM$/i.test(f.source),
  );
  assert.equal(templates.length, 8);
  assert.equal(audit.loading.files.length - templates.length, 17);
  assert.equal(
    templates.filter((f: { source: string }) =>
      /HOTSPOT3\.GAM$/i.test(f.source),
    ).length,
    6,
  );
  assert.equal(audit.loading.hotSpots.length, 16);
  for (const [i, s] of audit.loading.hotSpots.entries()) {
    assert.equal(s.name, 'HotSpot_parent_' + i);
    assert.equal(s.bbox, 1);
    assert.ok(s.phase === 0 || s.phase === 1);
  }
  const nodes = Object.values(
      audit.loading.nodes as Record<
        string,
        { name: string; parents: string[] }
      >,
    ),
    open = nodes.find((n) => n.name === 'open11'),
    port = nodes.find((n) => n.name === 'port11');
  assert.ok(open);
  assert.equal(open.parents.length, 1);
  assert.equal(audit.loading.nodes[open.parents[0]], port);
  assert.equal(audit.passed, true);
  assert.equal(
    audit.results.reduce((n: any, r: { frames: any }) => n + r.frames, 0),
    240,
  );
  for (const fixture of audit.results) {
    // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
    const { view } = await arenaView(6),
      sim = setup(view, 6, 1),
      r = sim.runners[0],
      p = fixture.initial.position,
      pose = {
        x: p[0],
        y: p[1],
        z: p[2],
        yaw: (fixture.initial.yaw * Math.PI) / 180,
      };
    Object.assign(r, pose, {
      dead: 0,
      inactive: false,
      movementEnabled: true,
      shield: 100,
      collisionProbe: { ...pose },
      rearProbe: { ...pose },
      previousPosition: { ...pose },
    });
    for (const [frame, sample] of fixture.samples.entries()) {
      sim.step(Math.fround(1 / 60), { throttle: 1 });
      assert.deepEqual(
        [r.x, r.y, r.z],
        sample.native.position,
        `native-loaded arena side ${fixture.side}, frame ${frame}`,
      );
      assert.equal(
        sim.portals.doors.get('11')?.height ?? 0,
        sample.nativeHeight,
        `native-loaded lift side ${fixture.side}, frame ${frame}`,
      );
      // Trigonometric residue differs below 1e-14; poses/lift above remain exact.
      for (const [actual, expected] of [
        [
          [r.lateralSpeed, r.localVerticalSpeed, -r.speed],
          sample.native.localVelocity,
        ],
        [Object.values(r.worldVelocity!), sample.native.worldVelocity],
      ]) {
        actual.forEach((value: number, i: number) =>
          assert.ok(
            Math.abs(value - expected[i]) < 1e-10,
            `velocity side ${fixture.side}, frame ${frame}`,
          ),
        );
      }
      assert.equal(r.grounded, sample.native.grounded);
      assert.equal(r.controlsEnabled, sample.native.controlsEnabled);
      assert.equal(r.supportContact, sample.native.supportContact);
      assert.equal(r.supportBrake, sample.native.brake);
    }
    view.arenaGroup.traverse(
      (o: import('../../src/model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      },
    );
  }
});
