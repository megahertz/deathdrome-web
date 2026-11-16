import * as THREE from '#three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readOptions, AudioDirector } from '../../src/audio-director.ts';
import {
  configureTextureQuality,
  graphicsRenderScale,
} from '../../src/graphics-quality.ts';
test('enhanced graphics defaults off, accepts only booleans and survives saved-option round trips', () => {
  for (const value of [
    undefined,
    null,
    {},
    { enhancedGraphics: 1 },
    { enhancedGraphics: 'true' },
  ]) {
    assert.equal(readOptions(value).enhancedGraphics, false);
  }
  const options = readOptions({
    enhancedGraphics: true,
    musicEnabled: false,
    brightness: 3,
  });
  const serialized = JSON.stringify(options);
  assert.deepEqual(readOptions(JSON.parse(serialized)), options);
  const director = new AudioDirector({ options });
  director.setOption('sfxVolume', 2);
  assert.equal(director.options.enhancedGraphics, true);
  director.setOption('enhancedGraphics', false);
  assert.equal(director.options.musicEnabled, false);
  assert.equal(director.options.brightness, 3);
});
test('cached textures switch to mipmapped linear filtering and restore nearest sampling exactly', () => {
  const texture = new THREE.Texture();
  configureTextureQuality(texture, false, 16);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.anisotropy, 1);
  const { version } = texture;
  configureTextureQuality(texture, true, 16);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(texture.anisotropy, 8);
  assert.ok(texture.version > version);
  configureTextureQuality(texture, true, 2);
  assert.equal(texture.anisotropy, 2);
  configureTextureQuality(texture, false, 16);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.anisotropy, 1);
});
test('enhanced scene size adapts to the display while native rendering stays 320 by 200', () => {
  for (const [w, h, dpr] of [
    [320, 200, 1],
    [624, 390, 2],
    [1280, 800, 1],
    [3840, 2400, 4],
  ]) {
    assert.equal(graphicsRenderScale(false, w, h, dpr), 1);
  }
  assert.equal(graphicsRenderScale(true, 320, 200, 1), 2);
  assert.equal(graphicsRenderScale(true, 624, 390, 2), 4);
  assert.equal(graphicsRenderScale(true, 1280, 800, 1), 4);
  assert.equal(graphicsRenderScale(true, 3840, 2400, 4), 6);
  assert.equal(graphicsRenderScale(true, 0, 0, 1), 2);
});
