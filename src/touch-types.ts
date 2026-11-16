import type { Runner } from './game-types.ts';
export type ActionName = 'FIRE' | 'JUMP' | 'WEAPON' | 'BARRIER';
export interface TouchButton {
  name: ActionName;
  x: number;
  y: number;
  radius: number;
}
export interface TouchGeometry {
  width: number;
  radius: number;
  buttons: TouchButton[];
}
export interface TouchPointer {
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  buttons: ActionName[];
}
export type TouchPose = Pick<Runner, 'id'> &
  Partial<
    Pick<
      Runner,
      | 'turn'
      | 'turnAcceleration'
      | 'grounded'
      | 'controlsEnabled'
      | 'speed'
      | 'nitro'
    >
  >;
