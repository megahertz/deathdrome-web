import type {
  CameraPose,
  GroundQuery,
  Marker,
  PathNode,
  Runner,
  Vec3,
} from './game-types.ts';
import type { createKeepMovingState } from './keep-moving.ts';
export interface SimulationOptions {
  arena?: number;
  round?: number;
  player?: number;
  maximumRunners?: number;
  keepMovingState?: ReturnType<typeof createKeepMovingState> | null;
  keepMovingEnabled?: boolean;
  seed?: number;
  paths?: PathNode[];
  rechargePaths?: any[];
  markers?: Marker[];
  ground?: GroundQuery;
  blocked?: (a: Vec3, b: Vec3) => boolean;
  lineBlocked?: ((a: Vec3, b: Vec3) => boolean) | null;
  sceneContacts?:
    | ((a: Vec3, b: Vec3, r?: Partial<Runner>, q?: Partial<Runner>) => any[])
    | null;
  sceneSweep?: ((a: Vec3, b: Vec3, r?: Runner) => any[]) | null;
  wallContact?: ((a: Vec3, b: Vec3) => any) | null;
  updateDoor?: (key: string, height: number) => void;
  updatePortal?: (id: string, height: number) => void;
  updateHotSpot?: (state: any) => void;
  updateExitHangar?: (state: any) => void;
  captureCamera?: () => CameraPose | null;
  updateEntrance?: (state: any) => void;
}
