import type * as THREE from '#three';
import type { SpanBuffer } from './span-buffer.ts';

export interface PreviewPixels {
  width: number;
  height: number;
  pixels: Uint32Array;
}
export interface PreviewFloorCache {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  pixels: Uint32Array;
  texture: THREE.CanvasTexture;
  spans: SpanBuffer;
}
export interface RunnerPreviewState {
  body: THREE.Group;
  model: THREE.Group;
  floor: THREE.Group;
  lightFrame: THREE.Group;
  floorModel: THREE.Group;
  centre: THREE.Vector3;
  angle: { value: number };
  rotation: number;
  rasterFloor?: PreviewFloorCache;
}
export type RunnerPreviewRoot = THREE.Group & {
  userData: Record<string, unknown> & { preview: RunnerPreviewState };
};
export interface PreviewPolygon {
  vertices: number[][];
  projected: number[][];
  texture: THREE.Texture | null;
}
