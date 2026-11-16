import type * as THREE from '#three';
export interface ModelPart {
  name: string;
}
export interface ModelFace extends ModelPart {
  v: number[][];
  texture?: string | null;
  color?: [number, number, number];
  drawType?: number;
  transparency?: number;
  altitude?: boolean;
  intersect?: boolean;
  intersectBox?: boolean;
  contactObject?: number | string;
  contactOrder?: number;
  contactRank?: number;
  shapeBroadPhase?: unknown;
  worldObject?: number | string;
  cycle?: { source: string; frames: string[]; [key: string]: unknown };
  renderPolygons?: { indices: number[]; uv: number[][] }[];
}
export interface CollisionBox extends ModelPart {
  vertices: number[][];
  worldObject?: number | string;
  contactRank?: number;
  intersect?: boolean;
}
export interface Attachment {
  position: number[];
  matrix: number[];
  collisionBounds?: BoundsTree;
}
export interface BoundsTree {
  bounds?: [number[], number[]];
  matrix?: number[];
  animated?: 'yaw' | 'chassis' | 'cockpit';
  children?: BoundsTree[];
}
export interface ModelData {
  meshes: ModelFace[];
  markers: {
    name: string;
    position: number[];
    matrix?: number[];
    worldObject?: number;
  }[];
  attachments?: Record<string, Attachment>;
  collisionBoxes?: CollisionBox[];
  worldObjects?: Record<string, any>;
  worldGroups?: Record<string, any>;
  worldTree?: BoundsTree;
  [key: string]: unknown;
}
// Authored models use one basic material per mesh. Groups have neither field.
export type RenderNode = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.MeshBasicMaterial;
};

export type ModelGeometry = Pick<ModelData, 'meshes'> & Partial<ModelData>;
