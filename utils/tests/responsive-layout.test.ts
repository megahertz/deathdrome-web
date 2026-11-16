import * as THREE from '#three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { hudScreenCommands } from '../../src/hud.ts';
import {
  responsiveHudLayout,
  responsiveRenderSize,
  applyResponsiveProjection,
  responsiveReticle,
} from '../../src/responsive-layout.ts';
import { fixture as stateFixture } from './fixtures.ts';
test('wide, phone and portrait HUDs fill the width, preserve instrument height and respect vertical insets', () => {
  for (const [width, height, touch] of [
    [1280, 720, false],
    [3440, 1440, false],
    [844, 390, true],
    [956, 440, true],
    [390, 844, true],
  ] as const) {
    const safe = { top: 12, right: 18, bottom: 16, left: 24 },
      layout = responsiveHudLayout(width, height, { touch, safe });
    for (const [panel, nativeHeight] of [
      [layout.top, 48],
      [layout.bottom, 63],
    ] as const) {
      assert.equal(panel.height, nativeHeight * panel.scale);
      assert.ok(panel.width + 1e-9 >= 320 * panel.scale);
      assert.equal(panel.x, 0);
      assert.equal(panel.width, width);
      assert.ok(
        panel.y >= safe.top &&
          panel.y + panel.height <= height - safe.bottom + 1e-10,
      );
    }
    assert.ok(layout.play.height > 0 && layout.play.y >= safe.top);
  }
});
test('touch HUD spans the full width and stays at the bottom through rotation and browser-bar resizing', () => {
  const safe = { left: 24, right: 8, bottom: 21 };
  for (const [width, height] of [
    [772, 360],
    [360, 772],
    [772, 360],
    [844, 390],
    [390, 760],
    [390, 844],
    [844, 390],
  ]) {
    const mobile = responsiveHudLayout(width, height, { touch: true, safe }),
      desktop = responsiveHudLayout(width, height, { safe });
    assert.deepEqual(mobile, desktop);
    assert.equal(mobile.bottom.x, 0);
    assert.equal(mobile.bottom.width, width);
    assert.ok(
      Math.abs(
        mobile.bottom.y + mobile.bottom.height - (height - safe.bottom),
      ) < 1e-9,
    );
  }
});
test('full-window rendering follows viewport proportions and stays within the graphics pixel budget', () => {
  for (const [w, h, dpr] of [
    [1280, 720, 2],
    [844, 390, 3],
    [3440, 1440, 2],
    [390, 844, 3],
    [7680, 2160, 2],
  ]) {
    const size = responsiveRenderSize(w, h, dpr),
      low = responsiveRenderSize(w, h, dpr, 0.4);
    assert.ok(size.width * size.height <= 1920 * 1200);
    assert.ok(size.width <= 4096 && size.height <= 4096);
    assert.ok(Math.abs(size.width / size.height - w / h) < 0.015);
    assert.ok(low.width < size.width && low.height < size.height);
    assert.equal(size.width % 2, 0);
    assert.equal(size.height % 2, 0);
  }
});
test('responsive camera fills the full window without stretching geometry and centers the playable area', () => {
  for (const [width, height] of [
    [1280, 720],
    [2560, 1080],
    [844, 390],
    [390, 844],
  ]) {
    const layout = responsiveHudLayout(width, height),
      camera = new THREE.PerspectiveCamera();
    applyResponsiveProjection(camera, layout);
    camera.updateMatrixWorld(true);
    const center = new THREE.Vector3(0, 0, -20).project(camera),
      right = new THREE.Vector3(1, 0, -20).project(camera),
      up = new THREE.Vector3(0, 1, -20).project(camera);
    assert.ok(
      Math.abs((right.x - center.x) * width - (up.y - center.y) * height) <
        1e-8,
    );
    assert.ok(
      Math.abs(
        ((1 - center.y) * height) / 2 -
          (layout.play.y + layout.play.height / 2),
      ) < 1e-8,
    );
    assert.equal(camera.view!.width, width);
    assert.equal(camera.view!.height, height);
  }
});
test('enhanced reticles agree with the camera projection and clamp to the visible play area', () => {
  const layout = responsiveHudLayout(1280, 720),
    reticle = responsiveReticle({ x: 0, y: 0 }, layout);
  assert.equal(reticle.x + reticle.width / 2, 640);
  assert.equal(reticle.y + reticle.height / 2, 360);
  const edge = responsiveReticle({ x: 10, y: -10 }, layout);
  assert.ok(edge.x + edge.width < 1280);
  assert.ok(edge.y + edge.height <= layout.play.y + layout.play.height);
});
test('original screen cues retain native positions and timings while the frame can be rendered separately', () => {
  const sim = stateFixture<import('../../src/simulation.ts').Simulation>({
    runners: [{ disrupted: 0 }],
    round: 1,
    requiredKills: 2,
    countdown: 2,
    entrance: { active: true, elapsed: 1 },
  });
  const cues = hudScreenCommands(sim, 0, {
    messages: [{ text: 'TEST', until: 10 }],
    now: 1,
  });
  assert.equal(cues[0].x, 150);
  assert.ok(cues.some((c) => c.value === 'ROUND 1' && c.y === 60));
  assert.ok(
    cues.some((c) => c.value === '2 KILLS REQUIRED TO ESCAPE' && c.y === 84),
  );
  assert.ok(cues.some((c) => c.value === '2' && c.y === 90 && c.scale === 1));
});

test('fullscreen and rotated cutout insets leave no horizontal HUD gutters', () => {
  for (const [width, height, safe] of [
    [740, 340, { left: 32 }],
    [772, 360, { left: 32 }],
    [360, 772, { top: 32, bottom: 21 }],
    [772, 360, { right: 32 }],
    [740, 340, { left: 0, right: 0 }],
  ] as [
    number,
    number,
    { left?: number; right?: number; top?: number; bottom?: number },
  ][]) {
    const layout = responsiveHudLayout(width, height, { touch: true, safe });
    for (const panel of [layout.top, layout.bottom]) {
      assert.equal(panel.x, 0);
      assert.equal(panel.width, width);
      assert.ok(
        Math.abs(
          panel.height / panel.scale - (panel === layout.top ? 48 : 63),
        ) < 1e-9,
      );
    }
    assert.deepEqual(layout.safe, {
      left: safe.left || 0,
      right: safe.right || 0,
      top: safe.top || 0,
      bottom: safe.bottom || 0,
    });
  }
});
