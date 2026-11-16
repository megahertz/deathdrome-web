import * as THREE from '#three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EnhancedEffects } from '../../src/enhanced-effects.ts';
import { EnhancedPipeline } from '../../src/enhanced-pipeline.ts';
import {
  AdaptiveResolution,
  VisualParticles,
  contactShadowPose,
  FOG_PROFILES,
} from '../../src/enhanced-visuals.ts';
import { fixture as stateFixture } from './fixtures.ts';
test('adaptive quality reduces sustained slow frames, recovers slowly, and ignores pauses and invalid samples', () => {
  const a = new AdaptiveResolution();
  for (let i = 0; i < 600; i++) {
    a.sample(1 / 30);
  }
  assert.ok(a.factor < 1 && a.factor >= 0.4);
  const reduced = a.factor;
  for (let i = 0; i < 500; i++) {
    a.sample(0.08, false);
  }
  assert.equal(a.factor, reduced);
  for (const dt of [0, -1, NaN, Infinity, 0.5]) {
    a.sample(dt);
  }
  assert.equal(a.factor, reduced);
  for (let i = 0; i < 3600; i++) {
    a.sample(1 / 60);
  }
  assert.equal(a.factor, 1);
  a.reset();
  for (let i = 0; i < 60; i++) {
    a.sample(1 / 60);
  }
  assert.equal(a.factor, 1);
});
test('contact shadows use supporting floors and fade and expand during a jump', () => {
  const runner = { x: 3, y: 0, z: 4, yaw: 0.5 },
    floor = { height: 0, normal: { x: 0, y: 1, z: 0 } };
  const grounded = contactShadowPose(runner, [
    floor,
    { height: 20, normal: floor.normal },
  ]);
  assert.equal(grounded!.y, 0.035);
  assert.equal(grounded!.x, 3);
  const airborne = contactShadowPose({ ...runner, y: 10 }, [floor]);
  assert.ok(airborne!.opacity < grounded!.opacity);
  assert.ok(airborne!.scale > grounded!.scale);
  assert.equal(contactShadowPose({ ...runner, y: 60 }, [floor]), null);
  assert.equal(contactShadowPose({ ...runner, dead: 1 }, [floor]), null);
  assert.equal(
    contactShadowPose(runner, [{ height: 0, normal: { x: 1, y: 0, z: 0 } }]),
    null,
  );
  assert.equal(contactShadowPose(runner, []), null);
  assert.equal(
    contactShadowPose(runner, [
      { height: -1, normal: { x: 0.3, y: 0.9, z: 0.1 } },
    ])!.normal.x,
    0.3,
  );
  assert.equal(FOG_PROFILES.length, 8);
  assert.ok(
    FOG_PROFILES.every(([, density]) => density > 0 && density <= 0.001),
  );
});
test('visual particles have an independent deterministic RNG, bounded storage and finite lifetimes', () => {
  const a = new VisualParticles(40),
    b = new VisualParticles(40),
    position = { x: 1, y: 2, z: 3 };
  const { random } = Math;
  try {
    Math.random = () => {
      throw Error('Visuals must not consume the simulation RNG');
    };
    a.burst(position, true);
    b.burst(position, true);
  } finally {
    Math.random = random;
  }
  assert.deepEqual(a.items, b.items);
  assert.equal(a.items.length, 40);
  const snapshot = { ...position };
  a.step(0.05);
  assert.deepEqual(position, snapshot);
  assert.ok(a.items.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
  for (let i = 0; i < 40; i++) {
    a.step(0.1);
  }
  assert.equal(a.items.length, 0);
});
test('MSAA follows hardware limits and selective glow restores scene state even if rendering fails', () => {
  const renderer = {
    capabilities: { maxSamples: 2 },
    setRenderTarget() {},
    clear() {},
    render() {
      throw Error('synthetic render failure');
    },
  };
  const pipeline = new EnhancedPipeline(
    renderer as unknown as import('#three').WebGLRenderer,
  );
  pipeline.resize(320, 200);
  assert.equal(pipeline.sceneTarget.samples, 2);
  assert.equal(pipeline.glowTarget.width, 80);
  const scene = new THREE.Scene(),
    background = new THREE.Color(0.1, 0.2, 0.3),
    fog = new THREE.FogExp2(0, 0.001);
  scene.background = background;
  scene.fog = fog;
  const material = new THREE.MeshBasicMaterial({ color: 0x774411 }),
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(mesh);
  const shadow = new THREE.Mesh(mesh.geometry, material);
  shadow.userData.enhancedSkipGlow = true;
  scene.add(shadow);
  assert.throws(
    () =>
      pipeline.glowScene(
        scene,
        new THREE.Camera(),
        new THREE.Vector4(0, 45, 320, 138),
      ),
    /synthetic/,
  );
  assert.equal(mesh.material, material);
  assert.equal(shadow.visible, true);
  assert.equal(scene.background, background);
  assert.equal(scene.fog, fog);
  pipeline.dispose();
  mesh.geometry.dispose();
  material.dispose();
});
test('enhanced effects remain inert when disabled and clear visual state without touching the runner', () => {
  const view = {
      scene: new THREE.Scene(),
      renderer: { domElement: { dataset: {} } },
    },
    effects = new EnhancedEffects(
      view as unknown as import('../../src/renderer.ts').View,
    );
  const runner = stateFixture<import('../../src/game-types.ts').Runner>({
      id: 0,
      x: 10,
      y: 0,
      z: 20,
      yaw: 0,
    }),
    sim = { runners: [runner], player: 0 };
  const snapshot = structuredClone(sim);
  effects.event({ type: 'destroyed', runner: 0 }, sim);
  assert.equal(effects.particles.items.length, 0);
  effects.setEnabled(true);
  effects.event({ type: 'destroyed', runner: 0 }, sim);
  assert.ok(effects.particles.items.length > 0);
  assert.equal(effects.flashes.length, 1);
  assert.deepEqual(sim, snapshot);
  effects.setEnabled(false);
  assert.equal(effects.particles.items.length, 0);
  assert.equal(effects.flashes.length, 0);
  assert.equal(effects.group.visible, false);
  assert.equal(view.scene.fog, null);
});

test('paused enhanced scenes reuse the last frame but redraw after a resolution change', async () => {
  const { View } = await import('../../src/renderer.ts');
  let clears = 0,
    renders = 0;
  const view = {
    enhancedGraphics: true,
    hud: true,
    renderScale: 2,
    updateResolution() {},
    scene: { traverse() {} },
    camera: { updateProjectionMatrix() {} },
    renderer: {
      setViewport() {},
      clear() {
        clears++;
      },
    },
    enhancements: {
      paused: true,
      frameScale: 2,
      render() {
        renders++;
        this.frameScale = view.renderScale;
      },
    },
  };
  View.prototype.draw.call(view);
  assert.equal(clears, 0);
  assert.equal(renders, 0);
  view.renderScale = 3;
  View.prototype.draw.call(view);
  assert.equal(clears, 1);
  assert.equal(renders, 1);
  View.prototype.draw.call(view);
  assert.equal(clears, 1);
  assert.equal(renders, 1);
});

test('glow replacements are released with disposed source materials and detached on cache clear', () => {
  const pipeline = new EnhancedPipeline({} as THREE.WebGLRenderer);
  let disposed = 0;
  for (let i = 0; i < 1000; i++) {
    const source = new THREE.MeshBasicMaterial();
    const black = pipeline.blackMaterial(source);
    assert.equal(pipeline.blackMaterial(source), black);
    black.addEventListener('dispose', () => disposed++);
    source.dispose();
  }
  assert.equal(disposed, 1000);
  assert.equal(pipeline.blackMaterials.size, 0);
  const source = new THREE.MeshBasicMaterial();
  pipeline.blackMaterial(source).addEventListener('dispose', () => disposed++);
  pipeline.clearMaterials();
  assert.equal(disposed, 1001);
  assert.equal(pipeline.blackMaterials.size, 0);
  source.dispose();
  assert.equal(disposed, 1001);
  pipeline.dispose();
});
