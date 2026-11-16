import type { Runner, Vec3 } from './game-types.ts';
import type { ContactNode } from './scene-nodes.ts';
export interface MovingRunner extends Runner {
  worldVelocity: Vec3;
  forwardVector: Vec3;
  planarForwardVector: Vec3;
  previousForwardVector: Vec3;
  previousPlanarForwardVector: Vec3;
  previousCollisionProbe: Vec3;
  previousCollisionCenter: Vec3;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
}
export interface RawContact {
  normal: Vec3;
  point: Vec3;
  node: ContactNode | null;
  secretDoor?: string | null;
  portal?: string | null;
  [key: string]: unknown;
}
export interface CollisionRecord extends RawContact {
  source: Vec3;
  endpoint: Vec3;
}
export type ContactRecords = Record<string, CollisionRecord>;
export type ContactQuery = (from: Vec3, to: Vec3) => RawContact[];
export interface CollisionEffect {
  applied: boolean;
  damage: number;
  landingCalls: number;
  speed?: number;
  normal?: Vec3;
}
