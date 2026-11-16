import {
  resetAI,
  stepAITarget,
  stepAIActions,
  stepAIAttack,
} from './ai-actions.ts';
import { stepAIActivity } from './ai-activity.ts';
import { stepNavigation, noteAIContact } from './ai-navigation.ts';
import { heldAIRates } from './ai-obstacles.ts';
import { BarrierTrails, BARRIER } from './barriers.ts';
import { updateLook } from './chase-camera.ts';
import { stepCollisionSweep } from './collision-sweep.ts';
import { reflectImpact, runnerOverlap } from './collision.ts';
import {
  applyDriveControls,
  updateDrive,
  stepControlDisable,
} from './drive.ts';
import { ENTRANCE, stepEntrance } from './entrance.ts';
import {
  beginEscape,
  stepEscape,
  beginOpponentExit,
  stepOpponentExit,
} from './escape.ts';
import { resetExitHangar, stepExitHangar } from './exit-hangar.ts';
import { GAME_TABLES } from './game-tables.ts';
import type {
  NavigationOptions,
  Runner,
  Vec3,
  PathNode,
  GroundQuery,
  CameraPose,
  ExitState,
  Controls,
  Point2,
} from './game-types.ts';
import { healthAfterDelta, damageDelta } from './health.ts';
import { HotSpots, HOT_SPOT } from './hot-spots.ts';
import {
  appendWeapon,
  consumeWeapon,
  resetInventory,
  selectInventoryWeapon,
  cycleInventory,
} from './inventory.ts';
import { createKeepMovingState, stepKeepMoving } from './keep-moving.ts';
import { KeyDoors } from './key-doors.ts';
import { activateShield, stepShield, NANO } from './nano-shield.ts';
import { RunnerPopulation, POPULATION } from './population.ts';
import { PortalDoors } from './portal-doors.ts';
import {
  queueProjectiles,
  hideRunnerProjectiles,
  resetRunnerProjectiles,
  updateMissileLock,
  stepRunnerProjectiles,
} from './projectiles.ts';
import { RechargeOrbs } from './recharge.ts';
import { checkRegionHealth } from './region-health.ts';
import { beginRespawn, stepRespawn } from './respawn.ts';
import { runnerContact, steerNitro } from './runner-contact.ts';
import { Scrub } from './scrub.ts';
import {
  launchSecondary,
  stepSecondaryProjectile,
  stepIon,
} from './secondary.ts';
import type { SimulationOptions } from './simulation-options.ts';
import {
  beginJump,
  stepSuspension,
  localToWorld,
  chassisMatrix,
} from './suspension.ts';
import { worldRegions } from './world-regions.ts';
import { Wrecks, WRECK } from './wrecks.ts';
// Game logic written for this port. Verified constants cite the supplied disc.
export const DYNAMICS = Object.freeze({
  maxAcceleration: 100,
  accelerationStep: 20,
  maxTurnAcceleration: 800,
  turnAccelerationStep: 100,
  turnDamping: 15,
  skidFactor: 3,
  skidRotation: 0.75,
  nitroRate: 400,
  nitroDuration: 1.3,
  brakes: [0.2, 2, 10],
}); // RUN/DYNAMICS.GW
export const MAX_LIVES = 7,
  EXTRA_LIFE_SCORE = 20_000,
  DISRUPTOR_SECONDS = 8,
  SHIELD_SECONDS = NANO.effectiveSeconds;
export const RUNNERS = [
  'redrunr',
  'blurunr',
  'ylwrunr',
  'whtrunr',
  'prprunr',
  'grnrunr',
  'pnkrunr',
  'orgrunr',
];
export const COLORS = [
  0xe8_34_25, 0x34_7d_f5, 0xf4_df_26, 0xd8_e2_e4, 0x92_43_cb, 0x38_d6_55,
  0xe2_55_b0, 0xf4_92_30,
];
export const AGGRESSION = GAME_TABLES.ai.aggression;

export const WEAPONS = [
  'Missile',
  'Nitro Ram',
  'ShockWave',
  'Disruptor',
  'Ion Sword',
  'NanoShield',
];
const SPAWNS = [
  [9.2, -3.82, 292.5],
  [3.82, -9.2, 337.5],
  [-3.82, -9.2, 22.5],
  [-9.2, -3.82, 67.5],
  [-9.2, 3.82, 112.5],
  [-3.82, 9.2, 157.5],
  [3.8, 9.2, 202.5],
  [9.2, 3.8, 247.5],
];
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
export function distance(a: Point2, b: Point2) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function nativePlanarForward(v: Point2) {
  const length = Math.fround(Math.sqrt(v.x * v.x + v.z * v.z)),
    inverse = length ? Math.fround(1 / length) : 0;
  return { x: Math.fround(v.x * inverse), z: Math.fround(v.z * inverse) };
}
export class Simulation {
  declare invulnerableHuman: boolean | undefined;

  declare arena: number;
  declare round: number;
  declare player: number;
  declare paths: PathNode[];
  declare ground: GroundQuery;
  declare blocked: (a: Vec3, b: Vec3) => boolean;
  declare sceneContacts:
    | ((a: Vec3, b: Vec3, r?: Partial<Runner>, q?: Partial<Runner>) => any[])
    | null;
  declare sceneSweep: ((a: Vec3, b: Vec3, r?: Runner) => any[]) | null;
  declare wallContact: ((a: Vec3, b: Vec3) => any) | null;
  declare entrance: import('./game-types.ts').EntranceState | null | undefined;
  declare escape: (ExitState & { runner: number }) | null;
  declare exitHangar: { door: number; sign: number; moving: boolean };
  declare roundBonus: { kills?: number; time?: number; credits?: number };
  declare aiNavigationPool:
    | import('./game-types.ts').NavigationPool
    | undefined;
  declare multiplayer: boolean | undefined;

  declare updateEntrance: (state: any) => void;
  declare captureCamera: () => CameraPose | null;
  declare updateExitHangar: (state: any) => void;
  declare lineBlocked: (a: Vec3, b: Vec3) => boolean;
  declare aiRouteCounts: number[];
  declare time: number;
  declare elapsed: number;
  declare requiredKills: number;
  declare events: any[];
  declare projectiles: import('./game-types.ts').Projectile[];
  declare barriers: any[];
  declare phase: string;
  declare countdown: number;
  declare score: number;
  declare lives: number;
  declare lifeThreshold: number;
  declare keepMovingState: ReturnType<typeof createKeepMovingState>;
  declare keepMovingEnabled: boolean;
  declare regions: Pick<ReturnType<typeof worldRegions>, 'maskAt'>;
  declare runners: Runner[];
  declare entranceZoneMask: number;
  declare population: RunnerPopulation;
  declare pickups: {
    id: number;
    type: any;
    x: any;
    y: any;
    z: any;
    cooldown: number;
  }[];
  declare recharge: RechargeOrbs;
  declare doors: KeyDoors;
  declare scrub: Scrub;
  declare barrierTrails: BarrierTrails;
  declare hotSpots: HotSpots;
  declare portals: PortalDoors;
  declare wrecks: Wrecks;
  declare seed: number;
  declare stepSeconds: number;
  declare scrubbing: boolean | undefined;

  constructor({
    arena = 1,
    round = 1,
    player = 0,
    maximumRunners = POPULATION.initialCount,
    keepMovingState = null,
    keepMovingEnabled = true,
    seed = 1996,
    paths = [],
    rechargePaths = [],
    markers = [],
    ground = () => 0,
    blocked = () => false,
    lineBlocked = null,
    sceneContacts = null,
    sceneSweep = null,
    wallContact = null,
    updateDoor = () => {},
    updatePortal = () => {},
    updateHotSpot = () => {},
    updateExitHangar = () => {},
    captureCamera = () => null,
    updateEntrance = () => {},
  }: SimulationOptions = {}) {
    Object.assign(this, {
      arena,
      round,
      player,
      seed,
      paths,
      ground,
      blocked,
      wallContact,
      sceneContacts,
      sceneSweep,
    });
    this.updateEntrance = updateEntrance;
    this.captureCamera = captureCamera;
    this.updateExitHangar = updateExitHangar;
    this.lineBlocked = lineBlocked || ((a, b) => this.blocked(a, b));
    this.aiRouteCounts = [0, 0, 0, 0, 0];
    this.time = GAME_TABLES.domains[arena - 1].roundSeconds[round - 1];
    this.elapsed = 0;
    this.requiredKills = GAME_TABLES.domains[arena - 1].kills[round - 1];
    this.events = [];
    this.projectiles = [];
    this.barriers = [];
    this.phase = 'running';
    this.countdown = ENTRANCE.seconds;
    this.score = 0;
    this.lives = GAME_TABLES.lives.initial;
    this.lifeThreshold = EXTRA_LIFE_SCORE;
    this.keepMovingState = keepMovingState ?? createKeepMovingState();
    this.keepMovingEnabled = keepMovingEnabled;
    this.regions = worldRegions(arena);
    this.runners = RUNNERS.map(
      (model, id) =>
        ({
          id,
          model,
          x: 0,
          y: 10,
          z: 0,
          yaw: 0,
          speed: 0,
          lateralSpeed: 0,
          turn: 0,
          acceleration: 0,
          turnAcceleration: 0,
          vy: 0,
          health: 100,
          kills: 0,
          outsideRegionUntil: 0,
          shield: 0,
          shieldPlanes: null,
          disrupted: 0,
          nitro: 0,
          dead: 0,
          fire: 0,
          barrier: 0,
          weapon: null,
          ammo: 0,
          weapons: [null],
          selectedWeapon: 0,
          targetNode: 0,
          previousNode: -1,
          stuck: 0,
        }) as Runner,
    );
    for (const r of this.runners) {
      this.spawn(r);
    }
    // Bootstrap the visible state; active actors sample again in model order
    // before their controller, as in 42efac / 444bd8.
    for (const r of this.runners) {
      r.zoneMask = this.regions.maskAt(r.x, r.z);
    }
    // 43445a / 444bd8 samples the selected runner's entrance region once.
    // This stays fixed as the runner moves; 42d109 uses it for path jumps.
    this.entranceZoneMask = this.runners[player].zoneMask;
    this.population = new RunnerPopulation(this, maximumRunners);
    this.population.initialize();
    this.pickups = markers
      .filter((m) => m.name.startsWith('enh'))
      .map((m, i) => ({
        id: i,
        type: m.name,
        x: m.position[0],
        y: m.position[1],
        z: m.position[2],
        cooldown: 0,
      }));
    this.recharge = new RechargeOrbs({
      arena,
      round,
      paths: rechargePaths,
      ground,
    });
    this.doors = new KeyDoors(updateDoor);
    this.scrub = new Scrub();
    this.barrierTrails = new BarrierTrails();
    this.hotSpots = new HotSpots(markers, updateHotSpot);
    this.portals = new PortalDoors(round, updatePortal);
    this.wrecks = new Wrecks();
    resetExitHangar(this);
  }
  randomInt() {
    const t = GAME_TABLES.random;
    this.seed = (Math.imul(this.seed, t.multiplier) + t.increment) >>> 0;
    return (this.seed >>> t.shift) & t.mask;
  }
  random() {
    return this.randomInt() / 32_768;
  }
  emit(type: string, data = {}) {
    this.events.push({ type, ...data });
  }
  spawnPose(id: number) {
    const [x, z, yaw] = SPAWNS[id];
    return { x, y: 10, z, yaw: (yaw * Math.PI) / 180 };
  }
  spawn(
    r: Pick<
      Runner,
      | 'acceleration'
      | 'aiState'
      | 'ammo'
      | 'id'
      | 'missileLockTarget'
      | 'muzzleSide'
      | 'navigation'
      | 'nitro'
      | 'nitroTarget'
      | 'respawn'
      | 'selectedWeapon'
      | 'speed'
      | 'targetNode'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
      | 'x'
      | 'y'
      | 'z'
    > &
      Partial<Runner>,
    options: NavigationOptions | undefined = {},
  ) {
    const [x, z, yaw] = SPAWNS[r.id];
    if (r.respawn?.routeIndex !== null && r.respawn?.routeIndex !== undefined) {
      this.aiRouteCounts[r.respawn.routeIndex]--;
    }
    Object.assign(r, {
      respawn: null,
      escaped: false,
      opponentExit: null,
      aiContact: { clear: false },
      inactive: false,
      aiActivity: 0,
      aiActivityUntil: 0,
      controlsEnabled: true,
      disableTimer: 0,
      movementEnabled: false,
      x,
      z,
      y: 10,
      yaw: (yaw * Math.PI) / 180,
      speed: 0,
      lateralSpeed: 0,
      turn: 0,
      acceleration: 0,
      turnAcceleration: 0,
      vy: 0,
      localVerticalSpeed: 0,
      worldVelocity: null,
      frontVelocity: 0,
      sideVelocity: 0,
      grounded: true,
      supportContact: true,
      supportBrake: 2,
      slopeImpulse: 0,
      chassisPitchDegrees: 0,
      chassisRollDegrees: 0,
      actionMode: 1,
      previousActionMode: 1,
      baseHeight: 0,
      forwardVector: null,
      planarForwardVector: null,
      previousForwardVector: null,
      previousPlanarForwardVector: null,
      previousPosition: { x: Math.fround(x), y: 10, z: Math.fround(z) },
      collisionProbe: { x: Math.fround(x), y: 10, z: Math.fround(z) },
      rearProbe: { x: 0, y: 0, z: 0 },
      collisionMinimumSpeed: 0,
      collisionClear: true,
      collisionContacts: null,
      collisionQueries: [],
      health: 100,
      shield: 0,
      shieldPlanes: null,
      disrupted: 0,
      nitro: 0,
      nitroTarget: null,
      ionSeconds: 0,
      ionTarget: null,
      destroyedAt: null,
      pendingDeath: null,
      lookDegrees: 0,
      muzzleSide: 0,
      missileLockTarget: null,
      aiMaxSpeed:
        r.id === this.player
          ? undefined
          : GAME_TABLES.runners[r.id].maxSpeed *
            GAME_TABLES.ai.levels[AGGRESSION[this.arena - 1][this.round - 1]]
              .speedFactor,
      dead: 0,
      stuck: 0,
      fireHeld: false,
      jumpHeld: false,
      secondaryHeld: false,
      keyring: { x: false, y: false, z: false },
    });
    resetInventory(r);
    resetRunnerProjectiles(this, r);
    this.barrierTrails?.reset(r.id);
    r.targetNode = this.nearestNode(r);
    if (r.id !== this.player) {
      resetAI(this, r, options);
    }
    this.emit('spawn', { runner: r.id });
  }
  nearestNode(r: Pick<Runner, 'x' | 'z'> & Partial<Runner>) {
    let best = Infinity,
      index = 0;
    for (const [i, n] of this.paths.entries()) {
      const d = Math.hypot(r.x - n.position[0], r.z - n.position[2]);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return index;
  }
  addScore(points: number) {
    const previous = this.score;
    this.score = Math.max(0, this.score + points);
    if (
      Math.floor(this.score / EXTRA_LIFE_SCORE) >
      Math.floor(previous / EXTRA_LIFE_SCORE)
    ) {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      this.emit('extraLife');
    }
    this.lifeThreshold =
      (Math.floor(this.score / EXTRA_LIFE_SCORE) + 1) * EXTRA_LIFE_SCORE;
  }
  damage(
    target: Pick<Runner, 'dead' | 'health' | 'id' | 'pendingDeath' | 'shield'> &
      Partial<Runner>,
    amount: number,
    owner: number | null | undefined,
    weapon = 'Laser',
    {
      armor = true,
      power = true,
      continuous = false,
      repeatLethal = false,
    } = {},
  ) {
    if (target.dead || (!repeatLethal && target.health <= 0)) {
      return false;
    }
    const previous = target.health,
      shielded = target.shield > 0;
    if (shielded && previous > 0) {
      return false;
    }
    target.health = healthAfterDelta(
      previous,
      damageDelta(
        amount,
        armor ? GAME_TABLES.runners[target.id].armorFactor : 1,
        power && owner !== null && owner !== undefined
          ? GAME_TABLES.runners[owner].weaponFactor
          : 1,
      ),
      { profileType: target.id === this.player ? 0 : 1, shielded },
    );
    if (!continuous) {
      this.emit('hit', { runner: target.id, weapon });
    }
    if (target.health === 0 && (previous > 0 || repeatLethal)) {
      // Hit handlers award the kill now. The active scene actor still completes
      // its physical/weapon action before 43360c enters destruction.
      target.pendingDeath = { owner, weapon };
      if (owner !== target.id && owner !== null && owner !== undefined) {
        this.runners[owner].kills++;
      }
    }
    return true;
  }
  checkRunnerHealth(
    target: Pick<
      Runner,
      | 'dead'
      | 'destroyedAt'
      | 'health'
      | 'id'
      | 'inactive'
      | 'ionSeconds'
      | 'ionTarget'
      | 'lateralSpeed'
      | 'nitro'
      | 'nitroTarget'
      | 'outsideRegionUntil'
      | 'pendingDeath'
      | 'profileName'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'x'
      | 'y'
      | 'yaw'
      | 'z'
      | 'zoneMask'
    > &
      Partial<Runner>,
    { finalActor = false } = {},
  ) {
    if (!finalActor && (target.dead || target.inactive)) {
      return false;
    }
    const outsideDomain = checkRegionHealth(this, target);
    if (target.health > 0) {
      target.pendingDeath = null;
      return false;
    }
    const {
      owner = null,
      weapon = 'Health',
      reason = null,
    } = target.pendingDeath ?? {};
    target.health = 0;
    target.dead = WRECK.respawnSeconds;
    hideRunnerProjectiles(this, target);
    target.destroyedAt = this.elapsed;
    this.wrecks.create(target, this.elapsed, this.ground);
    target.speed = 0;
    target.lateralSpeed = 0;
    target.nitro = 0;
    target.nitroTarget = null;
    target.ionSeconds = 0;
    target.ionTarget = null;
    target.shield = 0;
    target.shieldPlanes = null;
    target.pendingDeath = null;
    const deathReason = outsideDomain ? 'outsideDomain' : reason;
    this.emit('destroyed', {
      runner: target.id,
      owner,
      weapon,
      ...(deathReason ? { reason: deathReason } : {}),
    });
    return true;
  }
  scrubRunner(r: Pick<Runner, 'dead' | 'id'> & Partial<Runner>) {
    if (r.dead === Infinity) {
      return;
    }
    Object.assign(r, { health: 0, dead: Infinity, speed: 0 });
    hideRunnerProjectiles(this, r);
    this.emit('destroyed', { runner: r.id, owner: null, weapon: 'Scrub' });
    if (r.id === this.player) {
      this.phase = 'gameover';
      this.emit('gameover', { reason: 'Scrub' });
    }
  }
  fire(
    r: Pick<Runner, 'controlsEnabled' | 'dead' | 'id'> & Partial<Runner>,
    missile = false,
  ) {
    return queueProjectiles(this, r, missile);
  }
  secondary(
    r: Pick<
      Runner,
      | 'ammo'
      | 'controlsEnabled'
      | 'dead'
      | 'fire'
      | 'id'
      | 'ionSeconds'
      | 'ionTarget'
      | 'missileLockTarget'
      | 'nitro'
      | 'nitroTarget'
      | 'planarForwardVector'
      | 'selectedWeapon'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
      | 'x'
      | 'y'
      | 'yaw'
      | 'z'
      | 'zoneMask'
    > &
      Partial<Runner>,
  ) {
    if (r.dead || r.controlsEnabled === false || !r.weapon) {
      return;
    }
    const w = r.weapon;
    if (w === 'Nitro Ram' && r.nitro > 0) {
      return;
    }
    if (w === 'Missile') {
      return this.fire(r, true);
    }
    r.fire = 0.5;
    if (w === 'Nitro Ram') {
      r.nitro = Math.fround(DYNAMICS.nitroDuration);
      r.nitroTarget = updateMissileLock(this, r);
    }
    if (w === 'NanoShield') {
      activateShield(r);
    }
    if (!launchSecondary(this, r, w)) {
      r.fire = 0;
      return;
    }
    this.emit('secondary', { runner: r.id, weapon: w });

    consumeWeapon(r);
  }
  ai(
    r: Pick<
      Runner,
      | 'acceleration'
      | 'aiActivity'
      | 'aiActivityUntil'
      | 'aiContact'
      | 'aiMaxSpeed'
      | 'aiState'
      | 'ammo'
      | 'controlsEnabled'
      | 'dead'
      | 'fire'
      | 'forwardVector'
      | 'id'
      | 'ionSeconds'
      | 'ionTarget'
      | 'missileLockTarget'
      | 'navigation'
      | 'nitro'
      | 'nitroTarget'
      | 'planarForwardVector'
      | 'selectedWeapon'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'targetNode'
      | 'turn'
      | 'turnAcceleration'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
      | 'x'
      | 'y'
      | 'yaw'
      | 'z'
      | 'zoneMask'
    > &
      Partial<Runner>,
    dt: number,
  ): Controls {
    if (!stepAIActivity(this, r)) {
      return {};
    }
    const level =
      GAME_TABLES.ai.levels[AGGRESSION[this.arena - 1][this.round - 1]];
    const a = r.aiState;
    let driveRates;
    const recovering = a.mode === 'recover';
    // 42bc1f restores the aggression cap before dispatch; only the path action
    // can override it with the central-route cap during that update.
    r.aiMaxSpeed = GAME_TABLES.runners[r.id].maxSpeed * level.speedFactor;
    if (a.mode === 'path') {
      driveRates = stepNavigation(this, r, dt, DYNAMICS.maxAcceleration);
      stepAITarget(this, r, level, { branch: 'path' });
    } else if (a.mode === 'attack') {
      const target = this.runners[a.target!];
      driveRates = stepAIAttack(this, r, target, level);
      // Native performs the attack action before testing its expiry deadline.
      stepAITarget(this, r, level, { branch: 'attack', targetChecked: true });
    } else {
      driveRates = stepNavigation(this, r, dt, DYNAMICS.maxAcceleration);
      if (!r.navigation) {
        stepAITarget(this, r, level);
      }
    }
    const actions = stepAIActions(this, r, level, { recovering });
    return driveRates ? { ...actions, driveRates } : actions;
  }

  step(dt: number, input: Controls = {}) {
    const wasExiting = this.phase === 'exiting';
    if (this.phase !== 'running' && !wasExiting) {
      return;
    }
    this.events = [];
    if (!wasExiting && this.countdown > 0) {
      stepEntrance(this, dt);
      return;
    }
    this.stepSeconds = dt;
    this.time = wasExiting ? Math.max(0, this.time - dt) : this.time - dt;
    this.elapsed += dt;
    this.doors.step(dt);
    this.portals.step(dt);
    this.recharge.step(dt);
    this.hotSpots.step(dt);
    this.wrecks.step(dt, this.ground, () => this.randomInt());
    if (this.time <= 0 && !this.scrubbing) {
      this.scrubbing = true;
      this.scrub.start();
      this.emit('scrub');
    }
    this.scrub.step(dt);
    for (const r of this.runners) {
      if (r.opponentExit) {
        stepOpponentExit(this, r, dt);
        continue;
      }
      if (r.respawn) {
        stepRespawn(this, r, dt);
        continue;
      }
      if (r.dead > 0) {
        r.dead -= dt;
        if (
          r.dead <= 0 &&
          (this.phase === 'running' || this.phase === 'exiting')
        ) {
          if (r.id === this.player) {
            this.lives = Math.max(0, this.lives - 1);
            this.emit('lifeLost', { runner: r.id });
            if (this.lives === 0) {
              r.dead = Infinity;
              this.phase = 'gameover';
              this.emit('gameover');
              return;
            }
            beginRespawn(this, r);
          } else {
            this.population.replace(r);
          }
        }
        continue;
      }
      if (r.inactive) {
        continue;
      }
      r.fire = Math.max(0, r.fire - dt);
      r.barrier = Math.max(0, r.barrier - dt);
      stepShield(r, dt);
      // 42efac samples one active model before dispatching its controller/physics.
      // Later models still hold their previous sample during an earlier action.
      r.zoneMask = this.regions.maskAt(r.x, r.z);
      let c;
      if (r.id === this.player) {
        c = input;
      } else if (r.controlsEnabled === false) {
        c = {
          driveRates: heldAIRates(r),
          barrier: this.barrierTrails.states[r.id].held,
        };
      } else {
        c = this.ai(r, dt);
      }

      if (r.id === this.player) {
        updateLook(r, c.lookLeft, c.lookRight);
      }
      // 42f2ea: sleeping actors retain their scene presence, but skip model
      // physics, primary weapons, health checks and physical control timers.
      if (r.aiActivity === 2) {
        continue;
      }
      // 438c10 applies drive requests and Jump before controller Fire; the
      // physical action then integrates those stored rates and any new Nitro timer.
      applyDriveControls(r, c, DYNAMICS);
      r.aiContact = { clear: true };
      if (
        c.jump &&
        !r.jumpHeld &&
        r.controlsEnabled !== false &&
        beginJump(r)
      ) {
        this.emit('jump', { runner: r.id });
      }
      r.jumpHeld = !!c.jump;
      if (c.fire && !r.fireHeld) {
        if (r.weapon) {
          this.secondary(r);
        } else {
          this.fire(r);
        }
      }
      r.fireHeld = !!c.fire;
      if (c.secondary && !r.secondaryHeld) {
        this.secondary(r);
      }
      r.secondaryHeld = !!c.secondary;
      const oldBasis = chassisMatrix(r),
        oldForward = r.forwardVector ?? {
          x: -oldBasis[6],
          y: -oldBasis[7],
          z: -oldBasis[8],
        },
        oldPlanar = r.planarForwardVector ?? nativePlanarForward(oldForward);
      r.previousForwardVector = { ...oldForward };
      r.previousPlanarForwardVector = { ...oldPlanar };
      updateDrive(r, c, dt, DYNAMICS, {
        controlsApplied: true,
        human: r.id === this.player,
      });
      if (r.nitro > 0) {
        r.nitro = Math.fround(r.nitro - Math.fround(dt));
        r.nitroTarget = r.missileLockTarget;
        steerNitro(r, this.runners[r.nitroTarget!], dt, { finalTick: true });
        if (r.nitro <= 0) {
          r.nitroTarget = null;
          r.missileLockTarget = null;
        }
      }
      let velocity = localToWorld(r, {
        x: r.lateralSpeed,
        y: r.localVerticalSpeed,
        z: -r.speed,
      });
      r.worldVelocity = velocity;
      r.vy = velocity.y;
      const matrix = chassisMatrix(r);
      r.forwardVector = { x: -matrix[6], y: -matrix[7], z: -matrix[8] };
      r.planarForwardVector = nativePlanarForward(r.forwardVector);
      r.previousPosition = {
        x: Math.fround(r.x),
        y: Math.fround(r.y),
        z: Math.fround(r.z),
      };
      r.deltaX = Math.fround(velocity.x * Math.fround(dt));
      r.deltaY = Math.fround(velocity.y * Math.fround(dt));
      r.deltaZ = Math.fround(velocity.z * Math.fround(dt));
      if (r.actionMode === 2) {
        r.frontVelocity = velocity.y;
        r.sideVelocity = velocity.y;
      }
      // 42f7b0 stores delta Z without popping its extended product; the position
      // addition therefore uses that product, while X reloads its float delta.
      const next = {
        x: Math.fround(r.x + r.deltaX),
        y: r.y,
        z: Math.fround(r.z + velocity.z * Math.fround(dt)),
      };
      let wall;
      if (this.sceneSweep) {
        wall = null;
      } else if (this.wallContact) {
        wall = this.wallContact(r, next);
      } else if (this.blocked(r, next)) {
        wall = { normal: { x: -velocity.x, z: -velocity.z } };
      } else {
        wall = null;
      }

      const touchedDoors = new Set();
      const touchDoors = (hits: any[]) => {
        for (const hit of hits) {
          if (hit.secretDoor && !touchedDoors.has(hit.secretDoor)) {
            touchedDoors.add(hit.secretDoor);
            this.doors.touch(hit.secretDoor, r);
          }
        }
      };
      const touchPortal = (hits: any) => {
        for (const hit of hits) {
          if (
            hit.portal &&
            Math.abs(r.y - hit.height) <= GAME_TABLES.portals.verticalBand &&
            this.portals.touch(hit.portal, r, dt)
          ) {
            break;
          }
        }
      };
      if (this.sceneSweep) {
        r.x = next.x;
        r.z = next.z;
        const contact = stepCollisionSweep(
          r as import('./collision-types.ts').MovingRunner,
          dt,
          (a, b) => {
            const hits = this.sceneSweep!(a, b, r);
            touchDoors(hits);
            return hits;
          },
          {
            human: r.id === this.player,
            scrubCollidable: this.scrub.active,
            onContact: (kind, record) => {
              if (kind === 'hotSpot') {
                const id = Number(
                    record.node!.name.slice('HotSpot_parent_'.length),
                  ),
                  spot = this.hotSpots.spots[id];
                if (spot) {
                  const action = this.hotSpots.trigger(spot, r.id);
                  if (action) {
                    this.emit('hotSpot', { spot: id, runner: r.id, action });
                  }
                }
              }
            },
            onResponse: (response) => {
              if (response.damage) {
                this.damage(r, response.damage, null, 'Collision', {
                  power: false,
                });
              }
              for (let i = 0; i < response.landingCalls; i++) {
                if (r.id === this.player) {
                  this.emit('land', { runner: r.id, soundId: 1 });
                }
              }
              if (response.applied) {
                this.emit('collision', {
                  runner: r.id,
                  normal: response.normal,
                  speed: response.speed,
                  nitro: r.nitro > 0,
                });
                if (r.id !== this.player) {
                  noteAIContact(this, r, response.normal!);
                }
              }
            },
          },
        );
        r.collisionContacts = contact.records;
        r.collisionQueries = contact.queries;
        velocity = r.worldVelocity;
        r.vy = velocity.y;
      } else if (wall) {
        if (wall.point) {
          r.x = wall.point.x + wall.normal.x * 1.7;
          r.z = wall.point.z + wall.normal.z * 1.7;
        }
        reflectImpact(this, r, wall.normal, { nitro: r.nitro > 0 });
        if (r.id !== this.player) {
          noteAIContact(this, r, wall.normal);
        }
      } else {
        r.x = next.x;
        r.z = next.z;
      }
      r.x = Math.max(-900, Math.min(900, r.x));
      r.z = Math.max(-900, Math.min(900, r.z));
      if (wall) {
        velocity = localToWorld(r, {
          x: r.lateralSpeed,
          y: r.localVerticalSpeed,
          z: -r.speed,
        });
      }
      // 430606 dispatches a portal from the front support list; its stationary
      // threshold/ramp remains eligible when the moving panel has altitude off.
      const support = stepSuspension(
        r,
        dt,
        (x: any, z: any, y: number) => {
          const hits = this.ground(x, z, Math.max(200, y + 8), true);
          if (Array.isArray(hits)) {
            touchDoors(hits);
          }
          return hits;
        },
        velocity,
        { onFrontContacts: touchPortal },
      );
      r.worldVelocity = support.world;
      r.speed = -support.local.z;
      r.lateralSpeed = support.local.x;
      r.localVerticalSpeed = support.local.y;
      if (r.id === this.player) {
        for (let i = 0; i < support.landingCalls; i++) {
          this.emit('land', { runner: r.id, soundId: 1 });
        }
      }
      this.stepRunnerControlDisable(r, dt);
      stepKeepMoving(this, r, dt);
      if (this.barrierTrails.input(r, c.barrier)) {
        this.emit('barrier', { runner: r.id });
      }
      if (this.scrub.reaches(r)) {
        this.scrubRunner(r);
        continue;
      }
      for (const spot of this.hotSpots.spots) {
        if (!this.sceneSweep && this.hotSpots.markerContact(spot, r)) {
          const action = this.hotSpots.trigger(spot, r.id);
          if (action) {
            this.emit('hotSpot', { spot: spot.id, runner: r.id, action });
          }
        }
        if (this.hotSpots.forceContact(spot, r)) {
          const wasAlive = !r.dead && r.health > 0;
          this.damage(r, HOT_SPOT.damage, spot.owner, 'Hot Spot');
          if (
            wasAlive &&
            r.health === 0 &&
            spot.owner === this.player &&
            spot.owner !== r.id
          ) {
            this.addScore(HOT_SPOT.killScore);
          }
        }
      }
      if (beginOpponentExit(this, r)) {
        this.finishExitEntry(r, dt);
        continue;
      }
      if (
        r.id === this.player &&
        !r.dead &&
        r.kills >= this.requiredKills &&
        this.lives > 0 &&
        r.x * r.x + r.z * r.z <= GAME_TABLES.escape.radiusSquared &&
        r.y <= GAME_TABLES.escape.maximumHeight
      ) {
        beginEscape(this, r);
        this.finishExitEntry(r, dt);
        continue;
      }
      for (const pick of this.pickups) {
        if (
          pick.cooldown <= 0 &&
          distance(r, pick) < 8 &&
          Math.abs(r.y - pick.y) < 10
        ) {
          this.collect(r, pick);
        }
      }
      for (const orb of this.recharge.orbs) {
        if (
          orb.cooldown <= 0 &&
          distance(r, orb) < 8 &&
          Math.abs(r.y - orb.y) < 10
        ) {
          r.health = healthAfterDelta(r.health, GAME_TABLES.recharge.health, {
            profileType: r.id === this.player ? 0 : 1,
          });
          r.keys = (r.keys || 0) + 1;
          if (r.id === this.player) {
            this.addScore(GAME_TABLES.recharge.score);
          }
          this.recharge.collect(orb);
          this.emit('recharge', { runner: r.id });
        }
      }
      // 42f2d0 completes primary weapons before the outer loop visits another model.
      this.stepRunnerWeapons(r, dt);
      this.checkRunnerHealth(r);
    }
    for (const r of this.runners) {
      stepIon(this, r, dt);
    }
    for (const pick of this.pickups) {
      pick.cooldown = Math.max(0, pick.cooldown - dt);
    }
    for (const p of this.projectiles) {
      if (p.kind === 'ShockWave' || p.kind === 'Disruptor') {
        stepSecondaryProjectile(this, p, dt);
      }
    }
    this.projectiles = this.projectiles.filter(
      (p: { life: number }) => p.life > 0,
    );
    stepExitHangar(this, dt);
    this.barrierTrails.step(dt);
    this.barriers = this.barrierTrails.active;
    for (const b of this.barriers) {
      for (const q of this.runners) {
        if (this.barrierTrails.contacts(b, q) && q.shield <= 0) {
          this.damage(q, BARRIER.damage, b.owner, 'Barrier');
          if (b.owner === this.player) {
            this.addScore(BARRIER.contactScore);
          }
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        const a = this.runners[i],
          b = this.runners[j],
          contact = runnerOverlap(a, b);
        if (contact) {
          const nitroA = a.nitro > 0,
            nitroB = b.nitro > 0;
          runnerContact(this, a, b, contact);
          if (!a.dead) {
            if (contact.aImpact) {
              reflectImpact(this, a, contact.normal, { nitro: nitroA });
            }
            if (a.id !== this.player) {
              noteAIContact(this, a, contact.normal, {
                kind: 'runner',
                runner: b.id,
              });
            }
          }
          const normal = { x: -contact.normal.x, z: -contact.normal.z };
          if (!b.dead) {
            if (contact.bImpact) {
              reflectImpact(this, b, normal, { nitro: nitroB });
            }
            if (b.id !== this.player) {
              noteAIContact(this, b, normal, { kind: 'runner', runner: a.id });
            }
          }
        }
      }
    }
    if (wasExiting && this.phase === 'exiting') {
      stepEscape(this, dt);
    }
  }
  stepRunnerControlDisable(
    r: Pick<Runner, 'controlsEnabled' | 'disableTimer' | 'disrupted' | 'id'> &
      Partial<Runner>,
    dt: number,
  ) {
    if (stepControlDisable(r, dt)) {
      this.emit('controlsRestored', { runner: r.id });
    }
  }
  finishExitEntry(
    r: Pick<
      Runner,
      | 'ammo'
      | 'chassisPitchDegrees'
      | 'dead'
      | 'destroyedAt'
      | 'escaped'
      | 'forwardVector'
      | 'health'
      | 'id'
      | 'inactive'
      | 'ionSeconds'
      | 'ionTarget'
      | 'lateralSpeed'
      | 'missileLockTarget'
      | 'muzzleSide'
      | 'nitro'
      | 'nitroTarget'
      | 'opponentExit'
      | 'outsideRegionUntil'
      | 'pendingDeath'
      | 'planarForwardVector'
      | 'profileName'
      | 'respawn'
      | 'selectedWeapon'
      | 'shield'
      | 'shieldPlanes'
      | 'speed'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
      | 'x'
      | 'y'
      | 'yaw'
      | 'z'
      | 'zoneMask'
    > &
      Partial<Runner>,
    dt: number,
  ) {
    this.stepRunnerWeapons(r, dt, { finalActor: true });
    this.checkRunnerHealth(r, { finalActor: true });
    this.projectiles = this.projectiles.filter(
      (p: { life: number }) => p.life > 0,
    );
  }
  stepRunnerWeapons(
    r: Pick<
      Runner,
      | 'ammo'
      | 'chassisPitchDegrees'
      | 'dead'
      | 'escaped'
      | 'forwardVector'
      | 'id'
      | 'inactive'
      | 'missileLockTarget'
      | 'muzzleSide'
      | 'opponentExit'
      | 'planarForwardVector'
      | 'respawn'
      | 'selectedWeapon'
      | 'speed'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
      | 'x'
      | 'y'
      | 'yaw'
      | 'z'
      | 'zoneMask'
    > &
      Partial<Runner>,
    dt: number,
    options: { finalActor?: boolean } | undefined = {},
  ) {
    stepRunnerProjectiles(
      this,
      r,
      dt,
      (
        p: import('./game-types.ts').Projectile,
        old: { x: number; y: number; z: number },
      ) => this.projectileContact(p, old),
      options,
    );
  }
  projectileContact(p: import('./game-types.ts').Projectile, old: Vec3) {
    for (const spot of this.hotSpots.spots) {
      if (this.hotSpots.projectileContact(spot, old, p)) {
        const action = this.hotSpots.trigger(spot, p.owner);
        if (action) {
          this.emit('hotSpot', { spot: spot.id, runner: p.owner, action });
        }
        p.life = 0;
        break;
      }
    }
    if (this.blocked(old, p)) {
      p.life = 0;
    }
    if (p.life > 0) {
      for (const q of this.runners) {
        if (
          q.id !== p.owner &&
          !q.dead &&
          distance(p, q) < 4 &&
          Math.abs(p.y - q.y) < 4
        ) {
          const hadHealth = q.health > 0;
          this.damage(q, p.damage, p.owner, p.kind);
          if (hadHealth && p.owner === this.player) {
            this.addScore(
              p.kind === 'Missile'
                ? GAME_TABLES.combat.missileHitScore
                : GAME_TABLES.combat.laserHitScore,
            );
          }
          p.life = 0;
          break;
        }
      }
    }
    // Native scene traversal tests the dedbody facade; extent remains provisional.
    if (p.life > 0) {
      for (const w of this.wrecks.states) {
        if (!w?.body.visible) {
          continue;
        }
        const q = this.wrecks.bodyPosition(w);
        if (
          distance(p, q) < 4 &&
          p.y >= q.y &&
          p.y < q.y + 4 &&
          this.wrecks.hitBody(w)
        ) {
          if (p.owner === this.player) {
            this.addScore(WRECK.bodyHitScore);
          }
          this.emit('bodyHit', { runner: w.runner, owner: p.owner });
          p.life = 0;
          break;
        }
      }
    }
  }
  collect(
    r: Pick<Runner, 'id' | 'keyring' | 'weaponCells' | 'weapons'> &
      Partial<Runner>,
    p: { id?: number; type: string; cooldown?: number },
  ) {
    const types: Record<
      string,
      [import('./game-types.ts').WeaponName, number]
    > = {
      enh_ntro: ['Nitro Ram', 20],
      enh_lock: ['Missile', 40],
      enh_shok: ['ShockWave', 60],
      enh_disr: ['Disruptor', 40],
      enh_ion: ['Ion Sword', 30],
      enh_nano: ['NanoShield', 30],
    };
    const key = p.type.replace('.gam', ''),
      item = types[key];
    if (item) {
      const result = appendWeapon(r, item[0]);
      if (!result.added) {
        return false;
      }
      [, p.cooldown] = item;
      if (r.id === this.player && result.matching) {
        this.addScore(GAME_TABLES.inventory.matchingBonus);
        this.emit('matchingWeapons', { runner: r.id });
      }
    } else if (key === 'enh_life') {
      if (r.id === this.player) {
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
      }
      p.cooldown = 150;
    } else if (/^enhkey[xyz]$/.test(key)) {
      r.keyring[key.at(-1) as 'x' | 'y' | 'z'] = true;
      p.cooldown = 150;
    } else {
      return false;
    }
    this.emit('pickup', {
      runner: r.id,
      name: item?.[0] || (key === 'enh_life' ? 'Runner Credit' : 'Key'),
    });
    return true;
  }
  selectWeapon(
    r: Pick<
      Runner,
      'ammo' | 'selectedWeapon' | 'weapon' | 'weaponCells' | 'weapons'
    > &
      Partial<Runner>,
  ) {
    selectInventoryWeapon(r);
  }
  cycleWeapon(
    r: Pick<
      Runner,
      | 'ammo'
      | 'id'
      | 'missileLockTarget'
      | 'selectedWeapon'
      | 'weapon'
      | 'weaponCells'
      | 'weapons'
    > &
      Partial<Runner>,
  ) {
    cycleInventory(r);
    this.emit('weaponChanged', { runner: r.id, weapon: r.weapon || 'Laser' });
  }
  snapshot() {
    const p = this.runners[this.player];
    return {
      arena: this.arena,
      round: this.round,
      population: {
        maximum: this.population.maximum,
        cursor: this.population.cursor,
        exited: this.runners
          .filter((r: Pick<Runner, 'escaped'> & Partial<Runner>) => r.escaped)
          .map((r: Pick<Runner, 'id'> & Partial<Runner>) => r.id),
        exiting: this.runners
          .filter(
            (r: Pick<Runner, 'opponentExit'> & Partial<Runner>) =>
              r.opponentExit,
          )
          .map((r: Pick<Runner, 'id'> & Partial<Runner>) => r.id),
        materializing: this.runners
          .filter((r: Pick<Runner, 'respawn'> & Partial<Runner>) => r.respawn)
          .map((r: Pick<Runner, 'id'> & Partial<Runner>) => r.id),
        active: this.runners
          .filter(
            (r: Pick<Runner, 'dead' | 'inactive'> & Partial<Runner>) =>
              !r.dead && !r.inactive,
          )
          .map((r: Pick<Runner, 'id'> & Partial<Runner>) => r.id),
      },
      phase: this.phase,
      time: this.time,
      countdown: this.countdown,
      score: this.score,
      lives: this.lives,
      requiredKills: this.requiredKills,
      player: {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        health: p.health,
        kills: p.kills,
        weapon: p.weapon,
        ammo: p.ammo,
      },
      entrance: this.entrance
        ? {
            active: this.entrance.active,
            elapsed: this.entrance.elapsed,
            height: this.entrance.height,
            yawDegrees: this.entrance.yawDegrees,
            cameraStage: this.entrance.cameraStage,
            cameraLocal: this.entrance.cameraLocal,
            camera: this.entrance.camera,
          }
        : null,
      exitHangar: { ...this.exitHangar },
      escape: this.escape ? { ...this.escape } : null,
      roundBonus: this.roundBonus || null,
      projectiles: this.projectiles.length,
      scrub: {
        active: this.scrub.active,
        height: this.scrub.height,
        scale: this.scrub.scale,
        finished: this.scrub.finished,
      },
    };
  }
}
