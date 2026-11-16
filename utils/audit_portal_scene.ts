import './tests/setup.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { portalLocked } from '../src/portal-doors.ts';
import { View, THREE, makeArenaGeometry } from '../src/renderer.ts';
import { facetNormal } from '../src/scene-facets.ts';
import { Simulation } from '../src/simulation.ts';
const results = [],
  lockedBackApproaches = [];
for (let arena = 1; arena <= 8; arena++) {
  // oxlint-disable no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
  const data = JSON.parse(
    await readFile(
      new URL(`../private/assets/models/arena${arena}.json`, import.meta.url),
      'utf8',
    ),
  );
  // oxlint-enable no-await-in-loop
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
  view.arenaGroup.traverse((o: import('../src/model-types.ts').RenderNode) => {
    if (o.material) {
      view.collisionMaterials.set(o.material, o.material.side);
    }
  });
  view.arenaGroup.updateMatrixWorld(true);
  for (let round = 1; round <= 3; round++) {
    view.configurePortals(round);
    const ids = Object.keys(view.portals).toSorted(),
      chosen = [
        ...ids.filter((id) => !portalLocked(id, round)).slice(0, 2),
        ...ids.filter((id) => portalLocked(id, round)).slice(0, 1),
      ];
    for (const id of chosen) {
      for (const parts of Object.values(view.portals)) {
        if (parts.open) {
          parts.open.position.y = 0;
          parts.open.updateMatrixWorld(true);
        }
      }
      const pose = view.portalApproach(id);
      if (!pose) {
        continue;
      }
      const locked = portalLocked(id, round),
        group = locked ? view.portals[id].lock : view.portals[id].open,
        center = new THREE.Box3()
          .setFromObject(group!)
          .getCenter(new THREE.Vector3());
      if (locked) {
        const face = data.meshes.find((f: { name: string | string[] }) =>
            f.name.includes(`/port${id}/lock${id}/`),
          ),
          n = facetNormal(face.v);
        // The source lock panel is one-sided. Exercise its front face explicitly;
        // retain a separate back-face run instead of asserting a two-sided wall.
        if ((pose.x - center.x) * n.x + (pose.z - center.z) * n.z < 0) {
          pose.x = 2 * center.x - pose.x;
          pose.z = 2 * center.z - pose.z;
          pose.y = view.ground(pose.x, pose.z, center.y + 20);
          pose.yaw += Math.PI;
        }
      }
      const drive = (approachPose: {
        x: number;
        y: any;
        z: number;
        yaw: number;
      }) => {
        const sim = new Simulation({
          arena,
          round,
          ground: view.ground.bind(view),
          sceneSweep: (a: any, b: any) => view.sweepContacts(a, b),
          updatePortal: (portalId: any, h: any) =>
            view.setPortalHeight(portalId, h),
        });
        sim.countdown = 0;
        for (const r of sim.runners) {
          r.dead = Infinity;
        }
        const r = sim.runners[0];
        Object.assign(r, approachPose, {
          dead: 0,
          inactive: false,
          movementEnabled: true,
          health: 100,
          shield: 100,
          collisionProbe: {
            x: approachPose.x,
            y: approachPose.y,
            z: approachPose.z,
          },
          rearProbe: {
            x: approachPose.x,
            y: approachPose.y,
            z: approachPose.z,
          },
          previousPosition: {
            x: approachPose.x,
            y: approachPose.y,
            z: approachPose.z,
          },
        });
        let maximumLift = 0,
          advance = 0;
        for (let i = 0; i < 180; i++) {
          sim.step(1 / 60, { throttle: 1 });
          maximumLift = Math.max(
            maximumLift,
            sim.portals.doors.get(id)?.height ?? 0,
          );
          advance = Math.max(
            advance,
            (approachPose.x - r.x) * Math.sin(approachPose.yaw) +
              (approachPose.z - r.z) * Math.cos(approachPose.yaw),
          );
          if (advance > 14) {
            break;
          }
        }
        return {
          arena,
          round,
          id,
          locked,
          passed: locked
            ? maximumLift === 0 && advance < 14
            : maximumLift > 0 && advance > 14,
          openingPassed: locked ? maximumLift === 0 : maximumLift > 0,
          maximumLift,
          maximumAdvance: advance,
          initial: approachPose,
          final: { x: r.x, y: r.y, z: r.z },
        };
      };
      results.push(drive(pose));
      if (locked) {
        const back = {
          ...pose,
          x: 2 * center.x - pose.x,
          z: 2 * center.z - pose.z,
          yaw: pose.yaw + Math.PI,
        };
        back.y = view.ground(back.x, back.z, center.y + 20);
        const result = drive(back);
        Reflect.deleteProperty(result, 'passed');
        lockedBackApproaches.push({
          ...result,
          crossed: result.maximumAdvance > 14,
        });
      }
    }
  }
  view.arenaGroup.traverse((o: import('../src/model-types.ts').RenderNode) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
const report = {
  scope:
    'Connected production simulation and native facet predicates on decoded arena meshes, with active collision response. Representative portal approaches; no native scene-collector equivalence claim.',
  limitations: [
    'Selects the first two unlocked and first locked portal per arena/round. Referenced scene models and textures are not included in these local approaches.',
    'A failed straight-line approach can also indicate a diagnostic placement or terrain issue. The approach uses the complete panel principal axis, including barred gates.',
    'Locked main cases approach the source panel front side. Separate backside runs are recorded without assuming a two-sided wall: the original drawType&1 flag and native facet predicate permit backside crossings on one-sided panels. Full group/BBOX rules still require native scene comparison.',
    'Arena 6 portal 11 from the selected side remains blocked in all three rounds. Original physical/portal actions with the same supplied geometry also block this round-1 approach; the other side passes. The actual original scene collector remains unverified.',
    'Only native front support activates a portal; earlier wall/center/side activation, non-float heights and double-sided fan-triangle collision queries are superseded.',
    'Earlier inactive-runner and forced-double-sided locked-panel observations do not establish native scene behavior.',
  ],
  cases: results.length,
  passed: results.filter((r) => r.passed).length,
  openingPassed: results.filter((r) => r.openingPassed).length,
  unlockedPassagesPassed: results.filter((r) => !r.locked && r.passed).length,
  lockedPanelsCrossed: results.filter((r) => r.locked && !r.passed).length,
  results,
  lockedBackApproaches,
};
await writeFile(
  new URL(
    '../private/verification/portal-scene-regression.json',
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    cases: report.cases,
    passed: report.passed,
    failed: results
      .filter((r) => !r.passed)
      .map(({ arena, round, id, maximumLift, maximumAdvance }) => ({
        arena,
        round,
        id,
        maximumLift,
        maximumAdvance,
      })),
  }),
);
