import * as THREE from '#three';
// A shared uniform also reaches cached and animated model materials.
export const enhancedTextureSampling = { value: false };
export function configureTextureQuality(
  texture: THREE.Texture,
  enabled: boolean,
  maximumAnisotropy = 1,
) {
  texture.magFilter = enabled ? THREE.LinearFilter : THREE.NearestFilter;
  texture.minFilter = enabled
    ? THREE.LinearMipmapLinearFilter
    : THREE.NearestFilter;
  texture.anisotropy = enabled
    ? Math.max(1, Math.min(8, maximumAnisotropy))
    : 1;
  texture.needsUpdate = true;
}
export function graphicsRenderScale(
  enabled: boolean,
  width = 320,
  height = 200,
  pixelRatio = 1,
) {
  if (!enabled) {
    return 1;
  }
  const fit = Math.min(Math.max(0, width) / 320, Math.max(0, height) / 200);
  return Math.max(
    2,
    Math.min(6, Math.ceil(fit * Math.max(1, Math.min(2, pixelRatio || 1)))),
  );
}
