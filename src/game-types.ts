import type { GAME_TABLES } from './game-tables.ts';
import type { Simulation } from './simulation.ts';

export interface Point2 {
  x: number;
  z: number;
}
export interface Vec3 extends Point2 {
  y: number;
}
export interface Angles {
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
}
export type CameraPose = Vec3 & Angles;
export type WeaponName = Exclude<
  keyof typeof GAME_TABLES.combat.weaponIds,
  'Laser'
>;
export type Weapon = WeaponName | null;
export type AILevel = (typeof GAME_TABLES.ai.levels)[number];
export interface DriveRates {
  turn: number;
  turnAcceleration: number;
  acceleration: number;
}
export interface Controls {
  throttle?: number;
  steer?: number;
  fire?: boolean;
  jump?: boolean;
  barrier?: boolean;
  brake?: boolean;
  rearView?: boolean;
  lookLeft?: boolean;
  lookRight?: boolean;
  secondary?: boolean;
  driveRates?: DriveRates;
}
export interface RouteSegment {
  start: Vec3;
  end: Vec3;
  startNode: number | null;
  endNode: number | null;
  color: number;
  direction: Point2;
  normal: Point2;
  positive: Point2;
  negative: Point2;
  advanceDistance: number;
}
export interface PathNode {
  id: number;
  color: number;
  position: number[];
  links: number[];
  segment?: RouteSegment;
  segmentSlot?: number;
}
export interface Navigation {
  routeIndex: number | null;
  goalColor: number;
  segment: RouteSegment;
  alignment: Point2 | null;
  attackCollisions: number;
  visited: number;
  temporaryVisited: number;
  refreshAt: number;
}
export interface AIState {
  mode: string;
  target: number | null;
  attackAfter: number;
  attackUntil: number;
  recoverUntil: number;
  shotAt: number;
  lockActive: boolean;
  previousDirection: Point2;
  enhancerAt: number;
  jumpAt: number;
  barrierAt: number;
  barrierHeld: boolean;
  pendingJump?: boolean;
}
export interface RespawnState {
  phase: string;
  elapsed: number;
  bodyVisible: boolean;
  shroudVisible: boolean;
  routeIndex: number | null;
  goalColor: number | null;
  allocateRoute: boolean;
  born: number;
}
export interface ExitState {
  phase: string;
  remaining: number;
  foldDegrees: number;
  cockpitRollDegrees: number;
  runner?: number;
  camera?: CameraPose | null;
}
export interface Contact {
  point: Vec3;
  normal: Vec3;
  endpoint?: Vec3;
  kind?: string;
  runner?: number | null;
  owner?: number;
  fraction?: number;
  distance?: number;
}
export interface Runner extends Vec3 {
  id: number;
  model: string;
  yaw: number;
  speed: number;
  lateralSpeed: number;
  turn: number;
  acceleration: number;
  turnAcceleration: number;
  vy: number;
  health: number;
  kills: number;
  outsideRegionUntil: number;
  shield: number;
  disrupted: number;
  nitro: number;
  dead: number;
  fire: number;
  barrier: number;
  weapon: Weapon;
  ammo: number;
  weapons: Weapon[];
  weaponCells?: number[];
  selectedWeapon: number;
  targetNode: number;
  previousNode: number;
  stuck: number;
  respawn: RespawnState | null;
  escaped: boolean;
  opponentExit: ExitState | null;
  aiContact: { clear: boolean; runner?: number | null; wall?: Point2 };
  inactive: boolean;
  aiActivity: number;
  aiActivityUntil: number;
  controlsEnabled: boolean;
  disableTimer: number;
  movementEnabled: boolean;
  localVerticalSpeed: number;
  worldVelocity: Vec3 | null;
  frontVelocity: number;
  sideVelocity: number;
  grounded: boolean;
  supportContact: boolean;
  supportBrake: number;
  slopeImpulse: number;
  chassisPitchDegrees: number;
  chassisRollDegrees: number;
  actionMode: number;
  previousActionMode: number;
  baseHeight: number;
  forwardVector: Vec3 | null;
  planarForwardVector: Point2 | null;
  previousForwardVector: Vec3 | null;
  previousPlanarForwardVector: Point2 | null;
  previousPosition: Vec3;
  collisionProbe: Vec3;
  rearProbe: Vec3;
  previousCollisionProbe?: Vec3;
  previousRearProbe?: Vec3;
  collisionCenter?: Vec3;
  previousCollisionCenter?: Vec3;
  collisionMinimumSpeed: number;
  collisionClear: boolean;
  collisionContacts: import('./collision-types.ts').ContactRecords | null;
  collisionQueries: unknown[];
  shieldPlanes: { z: number; velocity: number; scale: number }[] | null;
  nitroTarget: number | null;
  ionSeconds: number;
  ionTarget: number | null;
  destroyedAt: number | null;
  pendingDeath: {
    owner?: number | null;
    weapon?: string;
    reason?: string | null;
  } | null;
  lookDegrees: number;
  muzzleSide: number;
  missileLockTarget: number | null;
  aiMaxSpeed?: number;
  fireHeld: boolean;
  jumpHeld: boolean;
  secondaryHeld: boolean;
  keyring: { x: boolean; y: boolean; z: boolean };
  keys?: number;
  aiState: AIState;
  navigation: Navigation | null;
  zoneMask: number;
  savedGoalColor?: number;
  floor?: number;
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  directSteering?: boolean;
  maxSpeed?: number;
  profileName?: string;
  killedByRunner?: number;
  lastHitWeaponCode?: number;
}
export interface Marker {
  name: string;
  position: number[];
  matrix?: number[];
  worldObject?: number;
}
export interface GroundHit {
  height: number;
  normal: Vec3;
}
export interface GroundQuery {
  (x: number, z: number, y?: number): number;
  (x: number, z: number, y: number, support: boolean): number | GroundHit[];
}
export interface NavigationOptions {
  routeIndex?: number | null;
  goalColor?: number | null;
}
export type SimulationLike = Simulation;
export type RunnerPose = Vec3 & Pick<Runner, 'yaw'> & Partial<Runner>;
export interface EntranceState {
  active: boolean;
  elapsed: number;
  height: number;
  yawDegrees: number;
  local: (Vec3 & { yawDegrees: number })[];
  outside: Vec3;
  target: Vec3;
  cameraStage: number;
  cameraTime: number;
  cameraLocal: Vec3;
  cameraAngles: Angles;
  announced: number[];
  camera?: CameraPose;
  start?: Vec3;
  velocity?: Partial<Vec3>;
  acceleration?: Partial<Vec3>;
}
// Primary slots receive their pose at their first action, after allocation.
export interface Projectile extends Vec3 {
  owner: number;
  kind: string;
  life: number;
  slot?: number;
  weaponId?: number;
  pending?: boolean;
  hidden?: boolean;
  damage: number;
  age: number;
  lifetime: number;
  dx: number;
  dy: number;
  dz: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  target?: number | null;
  scale: number;
  rotation: number;
  angles?: { pitch: number; yaw: number; roll: number };
  steering?: { yawDelta: number; pitchDelta: number };
}
export interface NavigationPool {
  nodes: (PathNode | null)[];
  segments: Set<number>;
  graphNodes: number;
  graphSegments: number;
}

export type ExitVisualState = Partial<ExitState>;
