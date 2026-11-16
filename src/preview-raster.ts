import * as THREE from '#three';
import type { RenderNode } from './model-types.ts';
import { registeredTextureCoordinates } from './native-texture.ts';
import { prepareProjectedTexturePolygon } from './polygon-clip.ts';
import type {
  RunnerPreviewState,
  PreviewPolygon,
  PreviewPixels,
  PreviewFloorCache,
} from './preview-types.ts';
import { SpanBuffer } from './span-buffer.ts';
import { drawIndexedTexturePolygon } from './texture-spans.ts';
const f = Math.fround;
export const MENU_PROJECTION = Object.freeze({
  near: 1.5,
  far: 1024,
  delta: 16,
  cullBackfaces: true,
  priorityBias: f(-20 * f(0.0005)),
  bounds: [66, 55, 253, 113],
  center: [93.5, 29],
  offset: [66, 55],
  scale: [
    f(f(1 / Math.tan((62 * Math.PI) / 360)) * 93.5),
    f(f(1 / Math.tan((18 * Math.PI) / 360)) * 29),
  ],
});
// The viewport offsets must be applied before the original float store and
// pixel rounding. Render in full display coordinates, then crop the window.
export function previewFloorPolygons(
  root: THREE.Object3D,
  camera: {
    updateMatrixWorld: (arg0: boolean) => void;
    matrixWorldInverse: THREE.Matrix4;
  },
) {
  const preview = root.userData.preview as RunnerPreviewState;
  const result: PreviewPolygon[] = [],
    point = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  camera.updateMatrixWorld(true);
  preview.floorModel.traverse((node: RenderNode) => {
    const facets = node.userData.facets as
      | { vertices: number[][] }[]
      | undefined;
    for (const facet of facets ?? []) {
      const world = facet.vertices.map((vertex: number[] | ArrayLike<number>) =>
        point
          .fromArray(vertex)
          .applyMatrix4(node.matrixWorld)
          .toArray()
          .map((itemValue) => f(itemValue)),
      );
      const { uv } = registeredTextureCoordinates(world);
      const vertices = world.map(
        (vertex: number[] | ArrayLike<number>, i: number) => {
          point.fromArray(vertex).applyMatrix4(camera.matrixWorldInverse);
          return [f(point.x), f(-point.y), f(-point.z), ...uv[i]];
        },
      );
      result.push({
        vertices,
        projected: prepareProjectedTexturePolygon(vertices, MENU_PROJECTION),
        texture: node.material?.map ?? null,
      });
    }
  });
  return result;
}
export function drawPreviewFloor(
  target: Uint32Array,
  polygons: PreviewPolygon[],
  textureFor: (map: THREE.Texture | null) => PreviewPixels | null,
  spanBuffer = new SpanBuffer(200),
) {
  for (const polygon of polygons) {
    if (polygon.projected.length === 0) {
      continue;
    }
    const texture = textureFor(polygon.texture);
    if (texture) {
      drawIndexedTexturePolygon(target, 320, polygon.projected, texture, {
        ...MENU_PROJECTION,
        far: 64,
        weightedUV: true,
        spanBuffer,
      });
    }
  }
}
const imageCache = new WeakMap<object, PreviewPixels>(),
  floorCache = new WeakMap<THREE.Object3D, PreviewFloorCache>();
function texturePixels(map: THREE.Texture | null) {
  const image = map?.image as
    | (CanvasImageSource & { width: number; height: number })
    | null
    | undefined;
  if (!image?.width || !image.height) {
    return null;
  }
  if (!imageCache.has(image)) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const bytes = ctx.getImageData(0, 0, image.width, image.height).data;
    // The authored floor uses the opaque mapper, including palette index zero.
    for (let i = 3; i < bytes.length; i += 4) {
      bytes[i] = 255;
    }
    imageCache.set(image, {
      width: image.width,
      height: image.height,
      pixels: new Uint32Array(bytes.buffer),
    });
  }
  return imageCache.get(image)!;
}
export function renderPreviewFloor(
  root: import('#three').Object3D,
  camera: {
    updateMatrixWorld: (arg0: boolean) => void;
    matrixWorldInverse: THREE.Matrix4;
  },
) {
  let cache = floorCache.get(root);
  if (!cache) {
    const canvas = document.createElement('canvas');
    canvas.width = 187;
    canvas.height = 58;
    const ctx = canvas.getContext('2d')!,
      image = ctx.createImageData(320, 200),
      pixels = new Uint32Array(image.data.buffer),
      texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = texture.minFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    cache = { canvas, ctx, image, pixels, texture, spans: new SpanBuffer(200) };
    floorCache.set(root, cache);
  }
  const black = new Uint32Array(Uint8Array.of(0, 0, 0, 255).buffer)[0];
  cache.pixels.fill(black);
  cache.spans.clear();
  drawPreviewFloor(
    cache.pixels,
    previewFloorPolygons(root, camera),
    texturePixels,
    cache.spans,
  );
  cache.ctx.putImageData(cache.image, -66, -55);
  cache.texture.needsUpdate = true;
  const preview = root.userData.preview as RunnerPreviewState;
  preview.floor.visible = false;
  preview.rasterFloor = cache;
  return cache.texture;
}
