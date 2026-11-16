import type { Vec3 } from './game-types.ts';
import type { prepareFacet } from './scene-facets.ts';
export interface BoxBounds {
  min: number[];
  max: number[];
  order?: number;
}
export interface SourceFacet {
  vertices: number[][];
  twoSided: boolean;
  name: string;
  contactObject?: BoxBounds;
  worldObject?: BoxBounds;
  contactOrder?: number;
  contactRank?: number;
  shapeBroadPhase?: boolean;
}
export type WorldFacet = ReturnType<typeof prepareFacet> &
  Omit<SourceFacet, 'worldObject'> & {
    worldBounds?: BoxBounds;
    altitudeBounds?: BoxBounds;
  };
export interface GeometryCache {
  source: SourceFacet[];
  matrix: number[];
  grid: Map<string, WorldFacet[]>;
  altitudeGrid: Map<string, WorldFacet[]>;
}
export interface SceneHit {
  normal: Vec3;
  point?: Vec3;
  height?: number;
  object: import('#three').Object3D;
  name: string;
  distance?: number;
}
