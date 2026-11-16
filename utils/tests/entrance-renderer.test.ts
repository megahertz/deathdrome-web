import assert from 'node:assert/strict';
import test from 'node:test';
import { beginEntrance } from '../../src/entrance.ts';
import { View, THREE, makeModel } from '../../src/renderer.ts';
import { Simulation } from '../../src/simulation.ts';

test('hangar geometry and collision queries share the entrance parent transform and reset together', () => {
  const parent = new THREE.Group(),
    hangar = makeModel({
      meshes: [
        {
          name: 'PLATFORM/hanger/floor',
          color: [1, 1, 1] as [number, number, number],
          v: [
            [-20, 0, -20, 0, 0],
            [0, 0, 20, 0, 0],
            [20, 0, -20, 0, 0],
          ],
        },
      ],
    }),
    view = {
      hangarGroup: hangar,
      arenaGroup: parent,
      ray: new THREE.Raycaster(),
      intersections: View.prototype.intersections,
      collisionMaterials: new Map(),
    };
  hangar.userData.baseMatrix = new THREE.Matrix4().toArray();
  hangar.matrixAutoUpdate = false;
  parent.add(hangar);
  hangar.traverse((o: import('../../src/model-types.ts').RenderNode) => {
    if (o.material) {
      view.collisionMaterials.set(o.material, o.material.side);
    }
  });
  View.prototype.setEntrance.call(view, { height: 38, yawDegrees: 90 });
  assert.equal(View.prototype.ground.call(view, 0, 0, 100), 38);
  View.prototype.setEntrance.call(view, null);
  assert.equal(View.prototype.ground.call(view, 0, 0, 100), 0);
});
test('entrance camera samples inherit hangar motion without modifying the controller', () => {
  const s = new Simulation();
  beginEntrance(s);
  s.step(1 / 60);
  const e = s.entrance,
    before = JSON.stringify(e),
    pose: Record<string, number> = {},
    view = {
      camera: {
        position: {
          set(x: any, y: any, z: any) {
            Object.assign(pose, { x, y, z });
          },
        },
        rotation: {
          set(pitch: any, yaw: any, roll: any) {
            Object.assign(pose, { pitch, yaw, roll });
          },
        },
      },
    };
  for (let i = 0; i < 10; i++) {
    View.prototype.follow.call(view, s.runners[0], 0, true, true, null, e);
  }
  assert.equal(JSON.stringify(e), before);
  assert.equal(pose.x, e!.camera!.x);
  assert.equal(pose.y, e!.camera!.y);
  assert.equal(pose.z, e!.camera!.z);
  assert.equal(pose.pitch, (e!.camera!.pitchDegrees * Math.PI) / 180);
  assert.equal(pose.yaw, (e!.camera!.yawDegrees * Math.PI) / 180);
});

test('the completion frame displays the native final camera before chase damping resumes', () => {
  const s = new Simulation();
  beginEntrance(s);
  for (let i = 0; i < 420; i++) {
    s.step(1 / 60);
  }
  const e = s.entrance,
    position = {},
    rotation: Record<string, number> = {},
    view = {
      camera: {
        position: {
          set(x: any, y: any, z: any) {
            Object.assign(position, { x, y, z });
          },
        },
        rotation: {
          set(pitch: any, yaw: any, roll: any) {
            Object.assign(rotation, { pitch, yaw, roll });
          },
        },
      },
    };
  View.prototype.follow.call(view, s.runners[0], 1 / 60, false, false, null, e);
  assert.deepEqual(position, {
    x: e!.camera!.x,
    y: e!.camera!.y,
    z: e!.camera!.z,
  });
  assert.equal(rotation.pitch, (e!.camera!.pitchDegrees * Math.PI) / 180);
  View.prototype.follow.call(view, s.runners[0], 0, false, false, null, e);
  assert.equal(position.y, e!.camera!.y);
  View.prototype.follow.call(view, s.runners[0], 1 / 60, false, false, null, e);
  assert.ok(position.y < e!.camera!.y);
});
