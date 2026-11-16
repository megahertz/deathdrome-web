import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { View, THREE } from '../../src/renderer.ts';
import {
  runnerLightContour,
  insideRunnerLight,
  lightLocalPoint,
} from '../../src/runner-light.ts';
const data = JSON.parse(
  readFileSync(
    new URL('../../private/assets/models/redrunr.json', import.meta.url),
  ).toString(),
);
const contour = runnerLightContour(data);
test('the source light has a hard forward footprint and rotates with the runner', () => {
  assert.equal(contour.vertices.length, 24);
  assert.ok(insideRunnerLight(contour, 0, -14));
  assert.ok(!insideRunnerLight(contour, 0, -16));
  assert.ok(insideRunnerLight(contour, 0, 2));
  assert.ok(!insideRunnerLight(contour, 0, 3));
  for (const yaw of [0, 0.4, Math.PI / 2, Math.PI, 5.9]) {
    const pose = { x: 80, z: 440, yaw },
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (const [x, z] of [
      [0, -14],
      [0, 2],
      [7, -7],
      [-7, -7],
      [0, 4],
    ]) {
      const world = [pose.x + c * x + s * z, pose.z - s * x + c * z],
        local = lightLocalPoint(world[0], world[1], pose);
      assert.ok(Math.hypot(local[0] - x, local[1] - z) < 1e-12);
      assert.equal(
        insideRunnerLight(contour, world[0], world[1], pose),
        insideRunnerLight(contour, x, z),
      );
    }
  }
});
test('gameplay light follows the pose and hides with the original exit/body states', () => {
  const view = Object.create(View.prototype);
  view.scene = new THREE.Scene();
  view.enablePlayerSpotlight(data);
  const r = {
    x: 10,
    y: 2,
    z: 30,
    yaw: Math.PI / 2,
    health: 100,
    dead: 0,
    inactive: false,
  };
  view.setPlayerSpotlight(r);
  assert.deepEqual(view.playerSpot.toArray(), [10, 2, 30]);
  assert.ok(Math.abs(view.playerSpotDirection.value.x) < 1e-12);
  assert.equal(view.playerSpotDirection.value.y, 1);
  r.inactive = true;
  view.setPlayerSpotlight(r);
  assert.equal(view.playerSpot.y, -10_000);
  r.inactive = false;
  (r as typeof r & { id: number }).id = 0;
  view.setPlayerSpotlight(r, { runner: 0, phase: 'fold' });
  assert.equal(view.playerSpot.y, -10_000);
  view.setPlayerSpotlight(r, { runner: 0, phase: 'center' });
  assert.equal(view.playerSpot.y, 2);
  r.dead = Infinity;
  view.setPlayerSpotlight(r);
  assert.equal(view.playerSpot.y, -10_000);
});
test('coverage matches the original polygon predicate across all eight runners and five headings', () => {
  const audit = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/runner-light-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
  const names = [
    'redrunr',
    'blurunr',
    'ylwrunr',
    'whtrunr',
    'prprunr',
    'grnrunr',
    'pnkrunr',
    'orgrunr',
  ];
  const contours = names.map((name) =>
    runnerLightContour(
      JSON.parse(
        readFileSync(
          new URL(
            '../../private/assets/models/' + name + '.json',
            import.meta.url,
          ),
        ).toString(),
      ),
    ),
  );
  assert.equal(audit.cases, 5000);
  assert.ok(audit.oldCircleMismatches > 0);
  for (let i = 0; i < audit.fixtures.length; i++) {
    const f = audit.fixtures[i];
    assert.equal(
      insideRunnerLight(contours[f.runner], f.x, f.z, f.pose),
      audit.native[i],
      'native light coverage ' + i,
    );
  }
});
