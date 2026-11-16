import type { Vec3 } from './game-types.ts';
export const AXES = ['x', 'y', 'z'] as const;
export function mapVec3(
  value: (axis: (typeof AXES)[number], index: number) => number,
): Vec3 {
  return { x: value('x', 0), y: value('y', 1), z: value('z', 2) };
}
