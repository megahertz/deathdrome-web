import { chooseAIEnhancer } from '../../src/ai-actions.ts';
import './diagnostic-setup.ts';
import { navigationState, routePoolState } from '../../src/ai-navigation.ts';
import { disableControls } from '../../src/drive.ts';
import { Effects } from '../../src/effects.ts';
import { beginEntrance } from '../../src/entrance.ts';
import { errorMessage } from '../../src/errors.ts';
import { resetExitHangar } from '../../src/exit-hangar.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { playerIsLocked } from '../../src/hud-warning.ts';
import { inAreaCount } from '../../src/hud.ts';
import { inventoryCells } from '../../src/inventory.ts';
import { projectileSlots, weaponId } from '../../src/projectiles.ts';
import { RecordedDemo } from '../../src/recorded-demo.ts';
import {
  View,
  THREE,
  modelData,
  makeModel,
  poseRunnerModel,
  makeRunnerModel,
  runnerRigState,
  texturesReady,
} from '../../src/renderer.ts';
import { runnerBodyVisible, cancelRespawn } from '../../src/respawn.ts';
import { Simulation, RUNNERS } from '../../src/simulation.ts';
import { emitterOrigins } from '../../src/weapon-emitters.ts';
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw Error('Missing diagnostic element: ' + selector);
    }
    return element;
  },
  view = new View($<HTMLCanvasElement>('#world'));
let combatAudit = { shots: 0, missiles: 0, secondaries: 0, lockedFrames: 0 };
let sim: Simulation,
  models: THREE.Group<THREE.Object3DEventMap>[] = [],
  pickups: (THREE.Group | null)[] = [],
  orbs: THREE.Group[] = [],
  effects: Effects,
  trace: {
    action: string;
    state: Record<string, unknown>;
    events: unknown[];
  }[] = [],
  busy = false,
  poseReference: {
    recording: any;
    sha256: any;
    seconds: number;
    kind: string;
  } | null = null,
  scenario:
    | (Record<string, unknown> & {
        kind?: string;
        initialTarget?: number;
        attacker?: number;
        spot?: number;
      })
    | null = null,
  rear = false,
  supportSurface: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
function clearSupportSurface() {
  if (!supportSurface) {
    return;
  }
  supportSurface.removeFromParent();
  supportSurface.geometry.dispose();
  supportSurface.material.dispose();
  supportSurface = null;
}
window.addEventListener('error', (event) => {
  console.error(event.error ?? event.message);
  $('#status').textContent =
    'Diagnostic failed: ' + (event.error?.message ?? event.message);
});
function resetTransition() {
  clearSupportSurface();
  sim.barrierTrails.states.forEach((s) => sim.barrierTrails.reset(s.owner));
  sim.barriers = [];
  delete sim.entrance;
  view.setEntrance(null);
  resetExitHangar(sim);
  sim.runners.forEach((r) => {
    r.lateralSpeed = 0;
    r.inactive = false;
    r.controlsEnabled = true;
    r.opponentExit = null;
    r.escaped = false;
    cancelRespawn(sim, r);
  });
  sim.wrecks.states.fill(null);
  Reflect.deleteProperty(sim, 'escape');
  Reflect.deleteProperty(sim, 'roundBonus');
  view.chaseCamera.reset();
}
THREE.DefaultLoadingManager.onLoad = () => {
  if (sim) {
    view.draw(sim.elapsed + 7.1, sim.time);
  }
};
const [paths, rechargePaths] = await Promise.all(
  ['ai-paths', 'recharge-paths'].map((n) =>
    fetch(`assets/${n}.json`).then((r) => r.json()),
  ),
);
const recordings = await fetch('assets/recordings/manifest.json').then((r) =>
  r.json(),
);
recordings.forEach((entry: { name: string }, i: number) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = entry.name;
  $<HTMLSelectElement>('#demo').append(o);
});
for (const [selector, rows] of [
  ['#arena', GAME_TABLES.domains],
  ['#runner', GAME_TABLES.runners],
] as const) {
  rows.forEach((r, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = r.name;
    $(selector).append(option);
  });
}
async function load() {
  if (busy) {
    return;
  }
  busy = true;
  $('#status').textContent = 'Loading domain…';
  try {
    const arena = Number($<HTMLSelectElement>('#arena').value) + 1,
      round = Number($<HTMLSelectElement>('#round').value),
      player = Number($<HTMLSelectElement>('#runner').value),
      seed = Number($<HTMLInputElement>('#seed').value);
    clearSupportSurface();
    const data = await view.arena(arena);
    view.configurePortals(round);
    effects = await Effects.create(view);
    sim = new Simulation({
      arena,
      round,
      player,
      seed,
      paths: paths[arena - 1],
      rechargePaths: rechargePaths[arena - 1],
      markers: data.markers,
      ground: view.ground.bind(view),
      blocked: (
        a: import('../../src/game-types.ts').Vec3,
        b: { x: number; y: number; z: number },
      ) => view.blocked(a, b),
      lineBlocked: (a: any, b: any) => view.lineBlocked(a, b),
      sceneContacts: (
        a: any,
        b: any,
        r?: Partial<import('../../src/game-types.ts').Runner>,
      ) =>
        view.lineContacts(a, b, {
          runners: sim.runners,
          models,
          ignore: r?.id,
        }),
      wallContact: (
        a: import('../../src/game-types.ts').Vec3,
        b: { x: number; y: number; z: number },
      ) => view.sweep(a, b),
      sceneSweep: (
        a: { x: any; y: any; z: any },
        b: { x: any; y: any; z: any },
      ) => view.sweepContacts(a, b),
      updateDoor: (key: string, height: number) =>
        view.setDoorHeight(key, height),
      updatePortal: (id: string, height: number) =>
        view.setPortalHeight(id, height),
      updateHotSpot: (s: { id: number; phase: number }) =>
        view.setHotSpotState(s),
      updateExitHangar: (h: { door: number; sign: number }) =>
        view.setExitHangar(h),
      captureCamera: () => view.captureCamera(),
      updateEntrance: (e: { yawDegrees: any; height: any } | null) =>
        view.setEntrance(e),
    });
    view.onDoorTouch = (key, r) => sim.doors.touch(key, r);
    view.onPortalTouch = (id, r) =>
      sim.portals.touch(id, r, sim.stepSeconds || 1 / 60);
    sim.countdown = 0;
    sim.time -= GAME_TABLES.entrance.seconds;
    $<HTMLSelectElement>('#portal').replaceChildren();
    for (const id of Object.keys(view.portals).sort()) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      $<HTMLSelectElement>('#portal').append(o);
    }
    $<HTMLSelectElement>('#secret-door').replaceChildren();
    for (const key of Object.keys(view.doors).sort()) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = key.toUpperCase();
      $<HTMLSelectElement>('#secret-door').append(o);
    }
    models = await Promise.all(
      RUNNERS.map(async (name) => {
        const m = makeRunnerModel(await modelData(name));
        view.objects.add(m);
        return m;
      }),
    );
    pickups = await Promise.all(
      sim.pickups.map(async (p) => {
        const m = makeModel(await modelData(p.type.replace('.gam', '')));
        view.objects.add(m);
        return m;
      }),
    );

    const orbData = await modelData('keytest');
    orbs = sim.recharge.orbs.map(() => {
      const m = makeModel(orbData);
      view.objects.add(m);
      return m;
    });
    await texturesReady();
    view.enablePlayerSpotlight(await modelData(RUNNERS[player]), {
      legacyRadius: Number($<HTMLSelectElement>('#light-radius').value),
    });
    trace = [];
    poseReference = null;
    scenario = null;
    combatAudit = { shots: 0, missiles: 0, secondaries: 0, lockedFrames: 0 };
    rear = false;
    $<HTMLButtonElement>('#rear').textContent = 'View back';
    view.hud = false;
    view.camera.position.set(0, 15, 0);
    present('Loaded');
    $('#status').textContent = 'Ready. Simulation is stopped between actions.';
  } catch (e) {
    $('#status').textContent = errorMessage(e);
    console.error(e);
  } finally {
    busy = false;
  }
}
$<HTMLSelectElement>('#light-radius').onchange = () => {
  if (!sim || busy) {
    return;
  }
  view.playerSpotRadius.value = Number(
    $<HTMLSelectElement>('#light-radius').value,
  );
  present(
    'Player light ' +
      $<HTMLSelectElement>('#light-radius').selectedOptions[0].textContent,
  );
};
function present(action: string, events: unknown[] = []) {
  sim.runners.forEach((r, i) => {
    poseRunnerModel(models[i], r, sim.escape);
  });
  sim.pickups.forEach((p, i) => {
    pickups[i]!.visible = p.cooldown <= 0;
    pickups[i]!.position.set(p.x, p.y, p.z);
  });
  sim.recharge.orbs.forEach((o, i) => {
    orbs[i].visible = o.cooldown <= 0;
    orbs[i].position.set(o.x, o.y, o.z);
  });
  view.setPlayerSpotlight(sim.runners[sim.player], sim.escape);
  view.follow(
    sim.runners[sim.player],
    0,
    rear,
    sim.barrierTrails.states[sim.player].generating,
    sim.escape,
    sim.entrance,
  );
  effects.sync(sim);
  view.setScrub(sim.scrub);
  view.syncExit(sim);
  view.draw(sim.elapsed + 7.1, sim.time);
  $<HTMLAnchorElement>('#render-export').href = canvas.toDataURL('image/png');
  const state: Record<string, unknown> = {
    ...sim.snapshot(),
    aiCombat: {
      ...combatAudit,
      playerLockedOn: playerIsLocked(sim, sim.player),
    },
    playerLightRadius: view.playerSpotRadius?.value,
    playerLightShape: view.playerSpotRadius?.value
      ? 'legacy circle'
      : 'source polygon',
    playerLightGain: view.playerSpotGain?.value,
    playerLightDirection: view.playerSpotDirection?.value.toArray(),
    hudInArea: inAreaCount(sim, sim.player),
    shieldMeshes: effects.pools.shields
      .filter((e) => e.mesh.visible)
      .map((e) => ({ finite: e.mesh.matrix.elements.every(Number.isFinite) })),
    respawnMeshes: effects.pools.respawns
      .filter((e) => e.mesh.visible)
      .map((e) => ({
        model: e.name,
        finite: e.mesh.matrix.elements.every(Number.isFinite),
      })),
    aiRouteCounts: sim.aiRouteCounts,
    aiRoutePool: routePoolState(sim),
    wrecks: sim.wrecks.states.filter(Boolean),
    wreckMeshes: effects.pools.wrecks
      .filter((e) => e.mesh.visible)
      .map((e) => ({
        name: e.name,
        parts: e.mesh.children
          .filter((p) => p.userData.wreckPart)
          .map((p) => ({
            name: p.userData.wreckPart,
            visible: p.visible,
            finite: p.matrix.elements.every(Number.isFinite),
            meshes: p.children.length,
          })),
      })),
    poseReference,
    scenario,
    camera: {
      x: view.camera.position.x,
      y: view.camera.position.y,
      z: view.camera.position.z,
      yaw: view.camera.rotation.y,
      pitch: view.camera.rotation.x,
    },
    inventory: sim.runners[sim.player].weapons,
    selectedSlot: sim.runners[sim.player].selectedWeapon,
    portalStates: Object.entries(view.portals).map(([id, parts]) => ({
      id,
      openPanelVisible: parts.open?.visible,
      lockPanelVisible: parts.lock?.visible,
      height: sim.portals.doors.get(id)?.height || 0,
    })),
    hotSpots: sim.hotSpots.spots.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      z: s.z,
      phase: s.phase,
      seconds: s.seconds,
      scale: s.scale,
      owner: s.owner,
    })),
    barrierTrails: sim.barriers.map((b) => ({ ...b })),
    secondaryEffects: sim.projectiles
      .filter((p) => p.kind === 'ShockWave' || p.kind === 'Disruptor')
      .map((p) => ({ ...p })),
    rechargeOrbs: sim.recharge.orbs.map((o) => ({ ...o })),
    runners: sim.runners.map((r) => ({
      id: r.id,
      zoneMask: r.zoneMask,
      aiActivity: r.aiActivity,
      aiActivityUntil: r.aiActivityUntil,
      rig: runnerRigState(models[r.id]),
      weapons: r.weapons,
      aiState: r.aiState,
      aiContact: r.aiContact,
      aiMaxSpeed: r.aiMaxSpeed,
      navigation: navigationState(sim, r),
      inactive: r.inactive,
      controlsEnabled: r.controlsEnabled,
      disableTimer: r.disableTimer,
      movementEnabled: r.movementEnabled,
      collision: {
        clear: r.collisionClear,
        minimumSpeed: r.collisionMinimumSpeed,
        frontProbe: r.collisionProbe,
        rearProbe: r.rearProbe,
        queries: r.collisionQueries,
        contacts: Object.fromEntries(
          Object.entries(r.collisionContacts ?? {}).map(([kind, c]) => [
            kind,
            {
              normal: c.normal,
              point: c.point,
              source: c.source,
              endpoint: c.endpoint,
              name: c.name ?? c.node!.name,
            },
          ]),
        ),
      },
      respawn: r.respawn,
      escaped: r.escaped,
      opponentExit: r.opponentExit,
      bodyVisible: runnerBodyVisible(r),
      dead: r.dead,
      pendingDeath: r.pendingDeath,
      destroyedAt: r.destroyedAt,
      shield: r.shield,
      shieldPlanes: r.shieldPlanes,
      nitro: r.nitro,
      nitroTarget: r.nitroTarget,
      x: r.x,
      y: r.y,
      z: r.z,
      yaw: r.yaw,
      speed: r.speed,
      lateralSpeed: r.lateralSpeed,
      vy: r.vy,
      localVerticalSpeed: r.localVerticalSpeed,
      worldVelocity: r.worldVelocity,
      chassisPitchDegrees: r.chassisPitchDegrees,
      chassisRollDegrees: r.chassisRollDegrees,
      frontVelocity: r.frontVelocity,
      sideVelocity: r.sideVelocity,
      grounded: r.grounded,
      supportContact: r.supportContact,
      slopeImpulse: r.slopeImpulse,
      actionMode: r.actionMode,
      baseHeight: r.baseHeight,
      forwardVector: r.forwardVector,
      turn: r.turn,
      lookDegrees: r.lookDegrees,
      health: r.health,
      kills: r.kills,
      disrupted: r.disrupted,
      ionSeconds: r.ionSeconds,
      ionTarget: r.ionTarget,
    })),
  };
  state.weaponProjectiles = sim.projectiles.filter(
    (p) => p.kind === 'Laser' || p.kind === 'Missile',
  );
  state.secretDoors = Object.fromEntries(
    Object.entries(sim.doors.doors)
      .filter(([key]) => view.doors[key])
      .map(([key, d]) => [
        key,
        { ...d, renderedHeight: view.doors[key].position.y },
      ]),
  );
  state.keyring = { ...sim.runners[sim.player].keyring };
  state.missileLocks = sim.runners.map((r) => ({
    runner: r.id,
    target: r.missileLockTarget ?? null,
    weaponId: weaponId(r),
  }));
  state.weaponSlotOrder = sim.runners.map((r) => ({
    runner: r.id,
    slots: projectileSlots(sim, r).map((p) => ({ slot: p.slot, kind: p.kind })),
  }));
  state.weaponInventories = sim.runners.map((r) => ({
    runner: r.id,
    cells: [...inventoryCells(r)],
    activeCount: r.weapons.length,
    selected: r.selectedWeapon,
  }));
  state.shotMeshes = effects.pools.shots
    .filter((e) => e.mesh.visible)
    .map((e) => ({
      model: e.name,
      finite: e.mesh.matrixWorld.elements.every(Number.isFinite),
      angles: [e.mesh.rotation.x, e.mesh.rotation.y, e.mesh.rotation.z],
      order: e.mesh.rotation.order,
    }));
  state.weaponEmitters = sim.runners
    .filter((r) => !r.dead)
    .map((r) => ({
      runner: r.id,
      human: r.id === sim.player,
      origins: emitterOrigins(r, r.id === sim.player),
      muzzleSide: r.muzzleSide,
    }));
  state.ionMeshes = effects.pools.ions
    .filter((e) => e.mesh.visible)
    .map((e) => ({
      finite:
        e.mesh.matrix.elements.every(Number.isFinite) &&
        [...e.mesh.children].every(
          (c) =>
            !(c as import('../../src/model-types.ts').RenderNode).geometry ||
            Array.from(
              (c as import('../../src/model-types.ts').RenderNode).geometry!
                .attributes.position.array,
            ).every(Number.isFinite),
        ),
    }));
  $('#state').textContent = JSON.stringify(state, null, 2);
  $('#events').textContent = JSON.stringify(events, null, 2);
  $('#ai-combat-summary').textContent =
    `AI shots: ${combatAudit.shots} · Missiles: ${combatAudit.missiles} · Other weapons: ${combatAudit.secondaries} · Player locked on: ${playerIsLocked(sim, sim.player)} · Lock frames: ${combatAudit.lockedFrames} · Player health: ${sim.runners[sim.player].health}`;
  trace.push({ action, state, events });
  $('#status').textContent = action + ': complete; simulation stopped.';
  // TextureLoader completes asynchronously; redraw without advancing state.
  requestAnimationFrame(() => {
    view.draw(sim.elapsed + 7.1, sim.time);
    $<HTMLAnchorElement>('#render-export').href = canvas.toDataURL('image/png');
  });
}
async function advance(action: string, frames: number, input = {}) {
  if (busy || !sim) {
    return;
  }
  busy = true;
  $('#status').textContent = action + ': advancing…';
  try {
    if (poseReference) {
      poseReference = {
        ...poseReference,
        kind: 'simulation initialized from original recorded poses; advanced by the rebuild',
      };
    }
    const events = [];
    for (
      let i = 0;
      i < frames && ['running', 'exiting'].includes(sim.phase);
      i++
    ) {
      sim.step(1 / 60, input);
      view.follow(
        sim.runners[sim.player],
        1 / 60,
        rear,
        sim.barrierTrails.states[sim.player].generating,
        sim.escape,
        sim.entrance,
      );
      if (playerIsLocked(sim, sim.player)) {
        combatAudit.lockedFrames++;
      }
      for (const e of sim.events) {
        if (e.runner !== sim.player) {
          if (e.type === 'shot') {
            combatAudit.shots++;
            if (e.missile) {
              combatAudit.missiles++;
            }
          }
          if (e.type === 'secondary') {
            combatAudit.secondaries++;
          }
        }
        events.push(e);
        if (e.type === 'hit' || e.type === 'destroyed') {
          effects.burst(
            sim.runners[e.runner],
            e.type === 'destroyed',
            sim.elapsed + 7.1,
          );
        }
      }
      if (i % 30 === 29 && i + 1 < frames) {
        $('#status').textContent =
          action + ': ' + (i + 1) + ' / ' + frames + ' frames';
        // oxlint-disable-next-line no-await-in-loop -- Advance one rendered frame at a time for the recorded control trace.
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    present(action, events);
  } catch (e) {
    $('#status').textContent = 'Diagnostic failed: ' + errorMessage(e);
    console.error(e);
  } finally {
    busy = false;
  }
}
const controls = {
  lookLeft: [60, { lookLeft: true }],
  lookRight: [60, { lookRight: true }],
  idle: [60, {}],
  idle5: [300, {}],
  frame: [1, {}],
  forward: [120, { throttle: 1 }],
  reverse: [120, { throttle: -1 }],
  left: [60, { throttle: 1, steer: 1 }],
  right: [60, { throttle: 1, steer: -1 }],
  barrier: [120, { throttle: 1, steer: 0.2, barrier: true }],
  fire: [120, { fire: true }],
  jump: [1, { jump: true }],
};
document.querySelectorAll<HTMLElement>('[data-drive]').forEach(
  (b) =>
    (b.onclick = () => {
      const [n, input] = controls[
        b.dataset.drive! as keyof typeof controls
      ] as [number, import('../../src/game-types.ts').Controls];
      advance(b.textContent, n, input);
    }),
);
$<HTMLButtonElement>('#advance-frames').onclick = () => {
  const frames = Math.max(
    1,
    Math.min(
      600,
      Math.trunc(Number($<HTMLInputElement>('#frame-count').value) || 1),
    ),
  );
  advance('Advance ' + frames + ' frames', frames);
};
$<HTMLButtonElement>('#load').onclick = load;
$<HTMLButtonElement>('#fire-once').onclick = () => {
  if (!sim || busy) {
    return;
  }
  sim.events = [];
  const r = sim.runners[sim.player];
  if (r.weapon) {
    sim.secondary(r);
  } else {
    sim.fire(r);
  }
  present(
    sim.projectiles.some((p) => p.pending)
      ? 'Weapon press queued; advance a frame to initialize'
      : 'Single weapon press',
    sim.events,
  );
};
$<HTMLButtonElement>('#ai-weapon-attack').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  combatAudit = { shots: 0, missiles: 0, secondaries: 0, lockedFrames: 0 };
  sim.ai = Simulation.prototype.ai;
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.lineBlocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.sceneContacts = () => [];
  sim.phase = 'running';
  sim.countdown = 0;
  sim.elapsed = 21;
  sim.time = 280;
  sim.projectiles = [];
  sim.scrub.active = false;
  const human = sim.runners[sim.player],
    enemy = sim.runners.find((r) => r.id !== sim.player),
    weapon = $<HTMLSelectElement>('#ai-weapon').value;
  for (const r of sim.runners) {
    Object.assign(r, {
      dead: Infinity,
      inactive: true,
      health: 100,
      respawn: null,
      speed: 0,
      lateralSpeed: 0,
      vy: 0,
      nitro: 0,
      ionSeconds: 0,
      missileLockTarget: null,
    });
  }
  for (const [r, z] of [
    [human!, 436],
    [enemy!, 461],
  ] as const) {
    sim.spawn(r);
    Object.assign(r, {
      dead: 0,
      inactive: false,
      x: 160,
      y: 0,
      z,
      yaw: 0,
      speed: 0,
      acceleration: 0,
      grounded: true,
      supportContact: true,
      movementEnabled: true,
      forwardVector: null,
      planarForwardVector: null,
      aiContact: { clear: true },
    });
  }
  enemy!.navigation = null;
  Object.assign(enemy!.aiState, {
    mode: 'attack',
    target: human.id,
    attackUntil: Infinity,
    shotAt: 0,
    enhancerAt: Infinity,
    jumpAt: Infinity,
    barrierAt: Infinity,
    previousDirection: { x: 0, z: -1 },
  });
  const types = {
    'Missile': 'enh_lock.gam',
    'ShockWave': 'enh_shok.gam',
    'Disruptor': 'enh_disr.gam',
    'Ion Sword': 'enh_ion.gam',
    'NanoShield': 'enh_nano.gam',
    'Nitro Ram': 'enh_ntro.gam',
  };
  sim.collect(enemy as unknown as import('../../src/game-types.ts').Runner, {
    type: types[weapon as keyof typeof types],
  });
  scenario = {
    kind: 'ai-weapon-attack',
    weapon,
    enemy: enemy!.id,
    limits:
      'Supplied stationary target and flat clear ground; production AI, pickups, inventory, locks and weapon updates run.',
  };
  present('AI ' + weapon + ' attack ready', sim.events);
};
$<HTMLButtonElement>('#projectile-flight').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  Object.assign(sim.runners[sim.player], {
    dead: 0,
    x: 100,
    y: 10,
    z: 100,
    yaw: 0,
    speed: 0,
    vy: 0,
    turn: 0,
    weapons: [null],
    selectedWeapon: 0,
    weapon: null,
  });
  poseReference = null;
  scenario = {
    kind: 'projectile flight diagnostic',
    ai: false,
    ground: 'flat diagnostic plane',
    walls: false,
    otherRunners: false,
  };
  present('Projectile flight arranged');
};
$<HTMLButtonElement>('#missile-guidance').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const p = sim.runners[sim.player],
    a = sim.runners[(sim.player + 1) % 8],
    b = sim.runners[(sim.player + 2) % 8];
  Object.assign(p, {
    dead: 0,
    x: 100,
    y: 0,
    z: 100,
    yaw: Math.PI / 4,
    speed: 0,
    vy: 0,
    turn: 0,
    weapons: [null, 'Missile', 'Missile', 'Nitro Ram'],
    selectedWeapon: 1,
  });
  Object.assign(a, {
    dead: 0,
    x: 40,
    y: 0,
    z: 20,
    yaw: Math.PI / 4,
    speed: 0,
    shield: 20,
  });
  Object.assign(b, {
    dead: 0,
    x: -80,
    y: 0,
    z: -60,
    yaw: Math.PI / 4,
    speed: 0,
    shield: 20,
  });
  sim.selectWeapon(p);
  sim.secondary(p);
  poseReference = null;
  scenario = {
    kind: 'missile guidance diagnostic',
    initialTarget: a.id,
    nextTarget: b.id,
    ai: false,
    ground: 'flat diagnostic plane',
    walls: false,
  };
  present('Missile guidance arranged', sim.events);
};
$<HTMLButtonElement>('#missile-retarget').onclick = () => {
  if (!sim || busy || scenario?.kind !== 'missile guidance diagnostic') {
    return;
  }
  const p = sim.runners[sim.player],
    a = sim.runners[scenario.initialTarget!];
  Object.assign(a, { x: p.x + 80, z: p.z + 80 });
  present('Initial missile target moved behind');
};
$<HTMLButtonElement>('#slot-reuse').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const r = sim.runners[sim.player];
  Object.assign(r, {
    dead: 0,
    x: 100,
    y: 10,
    z: 100,
    yaw: Math.PI / 4,
    speed: 0,
    turn: 0,
    vy: 0,
    weapons: [null, 'Missile'],
    selectedWeapon: 0,
  });
  sim.selectWeapon(r);
  for (let i = 0; i < 3; i++) {
    sim.fire(r);
  }
  sim.projectiles = sim.projectiles.filter((p) => p.slot !== 1 && p.slot !== 4);
  sim.cycleWeapon(r);
  sim.secondary(r);
  sim.fire(r);
  poseReference = null;
  scenario = {
    kind: 'projectile slot reuse diagnostic',
    removedSlots: [1, 4],
    expectedSlots: [0, 1, 2, 3, 4, 5, 6],
    ai: false,
    walls: false,
    ground: 'flat diagnostic plane',
  };
  present('Projectile slots reused', sim.events);
};
$<HTMLButtonElement>('#runner-order').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.events = [];
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const p = sim.runners[sim.player],
    q = sim.runners[(sim.player + 1) % 8];
  Object.assign(p, {
    dead: 0,
    inactive: false,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    speed: 0,
    turn: 0,
    vy: 0,
    weapons: [null, 'Missile'],
    selectedWeapon: 1,
  });
  Object.assign(q, {
    dead: 0,
    inactive: false,
    x: 110,
    y: 0,
    z: 99.5,
    yaw: Math.PI,
    speed: 75,
    turn: 0,
    vy: 0,
    shield: 20,
  });
  sim.ai = (r) => (r.id === q.id ? { throttle: 1 } : {});
  sim.selectWeapon(p);
  sim.secondary(p);
  poseReference = null;
  scenario = {
    kind: 'runner update order diagnostic',
    target: q.id,
    initialTargetZ: q.z,
    expectedFirstLock: q.id > p.id ? q.id : null,
    controls:
      'Only the target receives AI throttle. Advance one frame: the target crosses from in front to behind, and acquisition sees its position at the owner model slot.',
    ground: 'flat diagnostic plane',
    walls: false,
  };
  present('Runner update order arranged', sim.events);
};
$<HTMLButtonElement>('#damage-timing').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.score = 0;
  sim.lives = GAME_TABLES.lives.initial;
  sim.events = [];
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
    r.kills = 0;
  });
  const p = sim.runners[sim.player],
    q = sim.runners[(sim.player + 1) % 8];
  Object.assign(p, {
    dead: 0,
    inactive: false,
    x: 100,
    y: 0,
    z: 100,
    yaw: Math.PI / 4,
    speed: 0,
    turn: 0,
    vy: 0,
    health: 1,
    weapons: [null],
    selectedWeapon: 0,
    weapon: null,
  });
  Object.assign(q, {
    dead: 0,
    inactive: false,
    x: 300,
    y: 0,
    z: 300,
    speed: 0,
    turn: 0,
    vy: 0,
    shield: 20,
  });
  poseReference = null;
  scenario = {
    kind: 'damage and death timing diagnostic',
    attacker: q.id,
    damageFactors:
      'unit armor/power; original human profile factor remains active',
    controls:
      'Apply lethal hit leaves the zero-health runner active. Fire once then advance one frame: primary slots initialize before the actor health check hides them.',
    ground: 'flat diagnostic plane',
    ai: false,
    walls: false,
  };
  present('Lethal hit timing arranged', sim.events);
};
$<HTMLButtonElement>('#lethal-hit').onclick = () => {
  if (!sim || busy || scenario?.kind !== 'damage and death timing diagnostic') {
    return;
  }
  sim.events = [];
  sim.damage(sim.runners[sim.player], 4, scenario.attacker!, 'Laser', {
    armor: false,
    power: false,
  });
  present('Lethal hit applied; actor health check is pending', sim.events);
};
function prepareExitHandoff(opponent = false) {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = opponent ? 34 : 70;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.score = 0;
  sim.lives = GAME_TABLES.lives.initial;
  sim.events = [];
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
    r.kills = 0;
  });
  const actor = opponent ? (sim.player + 1) % 8 : sim.player,
    attacker = opponent ? sim.player : (sim.player + 1) % 8,
    p = sim.runners[actor],
    q = sim.runners[attacker];
  Object.assign(p, {
    dead: 0,
    inactive: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    turn: 0,
    vy: 0,
    health: 1,
    weapons: [null],
    selectedWeapon: 0,
    weapon: null,
  });
  Object.assign(q, {
    dead: 0,
    inactive: false,
    x: 200,
    y: 0,
    z: 200,
    speed: 0,
    turn: 0,
    vy: 0,
    shield: 20,
  });
  sim.fire(p);
  sim.stepRunnerWeapons(p, 1 / 60);
  p.weapons = [null, 'Missile'];
  p.selectedWeapon = 1;
  sim.selectWeapon(p);
  sim.secondary(p);
  sim.damage(p, 4, attacker, 'Laser', { armor: false, power: false });
  p.kills = sim.requiredKills;
  poseReference = null;
  scenario = {
    kind: 'exit handoff diagnostic',
    actor,
    attacker,
    human: !opponent,
    controls:
      'Advance one frame. Exit entry replaces health below one with float 0.9, hides initialized lasers, and runs the queued missile initializer once before the actor leaves normal motion.',
    ground: 'flat diagnostic plane',
    ai: false,
    walls: false,
  };
  present(
    opponent
      ? 'Zero-health opponent handoff arranged'
      : 'Zero-health exit handoff arranged',
    sim.events,
  );
}
$<HTMLButtonElement>('#exit-handoff').onclick = () => prepareExitHandoff(false);
$<HTMLButtonElement>('#opponent-handoff').onclick = () =>
  prepareExitHandoff(true);
$<HTMLButtonElement>('#exit-world').onclick = () => {
  if (!sim || busy) {
    return;
  }
  prepareExitHandoff(false);
  const q = sim.runners[scenario!.attacker!];
  Object.assign(q, { yaw: 0, speed: 30, acceleration: 20 });
  sim.ai = (r) =>
    r.id === q.id
      ? { driveRates: { turn: 0, turnAcceleration: 0, acceleration: 20 } }
      : {};
  sim.fire(q);
  sim.collect(q, { type: 'enh_shok.gam' });
  sim.cycleWeapon(q);
  sim.secondary(q);
  scenario = {
    ...scenario,
    kind: 'exit world continuation diagnostic',
    movingActor: q.id,
    controls:
      'Advance one frame to enter the exit. Other controllers disable, while held movement, queued primary shots and the independent ShockWave continue. The retired human primary pool stays frozen.',
  };
  present('Exit world continuation arranged', sim.events);
};
$<HTMLButtonElement>('#suspension').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.events = [];
  const normal = new THREE.Vector3(-0.15, 1, 0.2).normalize(),
    height = (x: number, z: number) =>
      Math.fround(20 + 0.15 * (x - 100) - 0.2 * (z - 100));
  sim.ground = ((
    x: number,
    z: number,
    _y: number = 200,
    support: boolean = false,
  ) =>
    support
      ? [
          {
            height: height(x, z),
            normal: {
              x: Math.fround(normal.x),
              y: Math.fround(normal.y),
              z: Math.fround(normal.z),
            },
          },
        ]
      : height(x, z)) as import('../../src/game-types.ts').GroundQuery;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const r = sim.runners[sim.player];
  Object.assign(r, {
    dead: 0,
    x: 100,
    y: 20,
    z: 100,
    yaw: 0,
    speed: 30,
    baseHeight: 20,
  });
  const geometry = new THREE.BufferGeometry(),
    vertices = [];
  for (const [x, z] of [
    [-100, -100],
    [300, -100],
    [-100, 300],
    [-100, 300],
    [300, -100],
    [300, 300],
  ]) {
    vertices.push(x, height(x, z) - 0.01, z);
  }
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  supportSurface = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x5f7d83, side: THREE.DoubleSide }),
  );
  view.objects.add(supportSurface);
  poseReference = null;
  scenario = {
    kind: 'three-point suspension diagnostic',
    actor: r.id,
    ground:
      'analytic slope y = 20 + 0.15(x - 100) - 0.2(z - 100); supplied upward normals',
    controls:
      'Drive forward to settle the front and side supports. Fire once and advance one frame to check tilted emitters. Jump uses the original contact flag and support response.',
    ai: false,
    walls: false,
  };
  present('Suspension slope arranged', sim.events);
};
function preparePhysicalAction(variant: string) {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.events = [];
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const r = sim.runners[sim.player];
  Object.assign(r, {
    dead: 0,
    inactive: false,
    movementEnabled: true,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    speed: variant === 'disable' ? 30 : 0,
    turn: 0,
    acceleration: 20,
    baseHeight: 0,
  });
  if (variant === 'disable') {
    sim.fire(r);
    disableControls(r, 1 / 60);
  } else {
    r.acceleration = 0;
    r.weapons = [null, 'Nitro Ram'];
    r.selectedWeapon = 1;
    sim.selectWeapon(r);
    sim.secondary(r);
  }
  poseReference = null;
  scenario = {
    kind: 'physical action diagnostic',
    variant,
    actor: r.id,
    controls:
      variant === 'disable'
        ? 'The queued pair can initialize while controls are disabled. One frame stores timer zero and keeps controls disabled; the next frame stores a negative timer and restores controls.'
        : 'With no throttle the active Nitro timer coasts without thrust. Advance 90 frames to observe the retained negative expiry timer; forward input then drives normally.',
    ai: false,
    walls: false,
    ground: 'flat diagnostic plane',
  };
  present(
    variant === 'disable'
      ? 'Control disable boundary arranged'
      : 'Nitro coast and expiry arranged',
    sim.events,
  );
}
$<HTMLButtonElement>('#control-disable').onclick = () =>
  preparePhysicalAction('disable');
$<HTMLButtonElement>('#nitro-coast').onclick = () =>
  preparePhysicalAction('nitro');
$<HTMLButtonElement>('#wall-sweep').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.events = [];
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const r = sim.runners[sim.player];
  Object.assign(r, {
    dead: 0,
    inactive: false,
    movementEnabled: true,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    speed: 60,
    turn: 0,
    acceleration: 0,
    baseHeight: 0,
    collisionProbe: { x: 100, y: 0, z: 92 },
    rearProbe: { x: 100, y: 0, z: 107.5 },
  });
  sim.sceneSweep = (
    a: { z: number; x: number; y: number },
    b: { z: number; x: number; y: number },
  ) => {
    const delta = b.z - a.z;
    if (!delta) {
      return [];
    }
    const fraction = (89.5 - a.z) / delta;
    if (fraction < 0 || fraction > 1) {
      return [];
    }
    return [
      {
        node: { name: 'diagnostic_wall' },
        normal: { x: 0, y: 0, z: 1 },
        point: {
          x: Math.fround(a.x + fraction * (b.x - a.x)),
          y: Math.fround(a.y + fraction * (b.y - a.y)),
          z: 89.5,
        },
      },
    ];
  };
  const geometry = new THREE.PlaneGeometry(24, 10);
  supportSurface = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x38a6ff,
      side: THREE.DoubleSide,
      wireframe: true,
    }),
  );
  supportSurface.position.set(100, 5, 89.5);
  view.objects.add(supportSurface);
  poseReference = null;
  scenario = {
    kind: 'native wall sweep diagnostic',
    actor: r.id,
    ground: 'flat analytic plane',
    wall: 'analytic z = 89.5 with inward +Z normal',
    controls:
      'Advance three frames to observe the eight-unit front sweep, position correction, rebound and high-speed collision damage. Other runners and AI are disabled.',
    ai: false,
  };
  present('Native wall sweep arranged', sim.events);
};
$<HTMLButtonElement>('#inventory-memory').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.blocked = () => false;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.score = 0;
  sim.lives = GAME_TABLES.lives.initial;
  sim.projectiles = [];
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const r = sim.runners[sim.player];
  Object.assign(r, {
    dead: 0,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    speed: 0,
    turn: 0,
    vy: 0,
    weapons: [null],
    weaponCells: [4, 0, 0, 0],
    selectedWeapon: 0,
  });
  sim.selectWeapon(r);
  sim.collect(r!, { type: 'enh_nano.gam' });
  sim.cycleWeapon(r);
  sim.secondary(r);
  const draws = { randomInt: () => 6 };
  poseReference = null;
  scenario = {
    kind: 'inventory memory diagnostic',
    rng: [6],
    activeInventory: [...r.weapons],
    retainedCells: [...inventoryCells(r)],
    choiceWithRetainedCells: chooseAIEnhancer(draws, r),
    choiceWithColdCells: chooseAIEnhancer(draws, { weapons: [null] }),
    ai: false,
    walls: false,
    ground: 'flat diagnostic plane',
    note: 'Supplied RNG result compares identical visible inventories with different inactive cells.',
  };
  present('Inventory memory arranged', sim.events);
};
$<HTMLButtonElement>('#entrance').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  sim.ai = () => ({});
  sim.runners.forEach((r) => {
    sim.spawn(r);
  });
  sim.population.initialize();
  sim.phase = 'running';
  sim.elapsed = 0;
  sim.countdown = GAME_TABLES.entrance.seconds;
  sim.time = GAME_TABLES.domains[sim.arena - 1].roundSeconds[sim.round - 1];
  sim.projectiles = [];
  effects.clearBursts();
  view.chaseCamera.reset();
  poseReference = null;
  scenario = { kind: 'entrance diagnostic', ai: false };
  beginEntrance(sim);
  present('Entrance restarted');
};
$<HTMLButtonElement>('#rear').onclick = () => {
  if (!sim || busy) {
    return;
  }
  rear = !rear;
  $<HTMLButtonElement>('#rear').textContent = rear
    ? 'View forward'
    : 'View back';
  present(rear ? 'Rear camera' : 'Forward camera');
};
$<HTMLButtonElement>('#show-poses').onclick = async () => {
  if (busy || !sim) {
    return;
  }
  busy = true;
  try {
    const entry = recordings[Number($<HTMLSelectElement>('#demo').value)],
      seconds = Number($<HTMLInputElement>('#demo-time').value),
      demo = new RecordedDemo(
        await fetch('assets/recordings/' + entry.file).then((r) =>
          r.arrayBuffer(),
        ),
      );
    resetTransition();
    const poses = demo.sample(seconds);
    poses.forEach((p, i) => {
      Object.assign(sim.runners[i], {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: (p.yaw * Math.PI) / 180,
        health: p.health,
        kills: p.kills,
        dead: 0,
        inactive: false,
        speed: -p.velocity[2],
        lateralSpeed: p.velocity[0],
        vy: p.velocity[1],
      });
    });
    poseReference = {
      recording: entry.name,
      sha256: entry.sha256,
      seconds,
      kind: 'original recorded positions; not simulated by this rebuild',
    };
    present('Original recorded poses');
  } catch (e) {
    $('#status').textContent = errorMessage(e);
    console.error(e);
  } finally {
    busy = false;
  }
};
$<HTMLButtonElement>('#recharge').onclick = () => {
  if (!sim?.recharge.orbs.length) {
    return;
  }
  const p = sim.runners[sim.player],
    o = sim.recharge.orbs.find((orb) => orb.cooldown <= 0);
  if (!o) {
    return;
  }
  Object.assign(p, { x: o.x, y: o.y, z: o.z, speed: 0, health: 10 });
  advance('Recharge capture', 1);
};
$<HTMLButtonElement>('#inventory').onclick = () => {
  if (!sim) {
    return;
  }
  sim.events = [];
  for (let i = 0; i < 3; i++) {
    sim.collect(sim.runners[sim.player], { type: 'enh_lock.gam' });
  }
  present('Three missile pickups', sim.events);
};
$<HTMLButtonElement>('#cycle').onclick = () => {
  if (!sim) {
    return;
  }
  sim.events = [];
  sim.cycleWeapon(sim.runners[sim.player]);
  present('Cycle weapon', sim.events);
};
$<HTMLButtonElement>('#escape').onclick = () => {
  if (!sim) {
    return;
  }
  Object.assign(sim.runners[sim.player], {
    x: 0,
    y: 0,
    z: 0,
    kills: sim.requiredKills,
    speed: 0,
  });
  advance('Eligible central escape', 1);
};
$<HTMLButtonElement>('#death').onclick = () => {
  if (!sim) {
    return;
  }
  sim.events = [];
  const p = sim.runners[sim.player];
  p.shield = 0;
  sim.damage(p, 10000, (sim.player + 1) % 8);
  sim.checkRunnerHealth(p);
  present('Player destruction', sim.events);
};
$<HTMLButtonElement>('#opponent-death').onclick = () => {
  if (!sim || busy) {
    return;
  }
  const q = sim.runners.find((r) => r.id !== sim.player && !r.dead);
  if (!q) {
    return;
  }
  sim.events = [];
  scenario = {
    kind: 'opponent replacement diagnostic',
    target: q.id,
    initialActive: sim.runners.filter((r) => !r.dead).map((r) => r.id),
    ai: true,
  };
  q.shield = 0;
  sim.damage(q, 10000, sim.player);
  sim.checkRunnerHealth(q);
  present('Opponent destruction', sim.events);
};
$<HTMLButtonElement>('#opponent-exit').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 35;
  sim.projectiles = [];
  sim.scrubbing = false;
  sim.scrub.active = false;
  const p = sim.runners[sim.player],
    q = sim.runners.find((r) => r.id !== sim.player && !r.dead);
  if (!q) {
    return;
  }
  Object.assign(p, {
    x: 0,
    y: 0,
    z: 35,
    yaw: 0,
    speed: 0,
    vy: 0,
    turn: 0,
    acceleration: 0,
  });
  Object.assign(q, {
    x: 0,
    y: 0,
    z: 0,
    speed: 0,
    vy: 0,
    turn: 0,
    acceleration: 0,
    kills: sim.requiredKills,
  });
  poseReference = null;
  scenario = {
    kind: 'opponent exit diagnostic',
    target: q.id,
    ai: false,
    initialRouteCounts: [...sim.aiRouteCounts],
    initialScore: sim.score,
    initialLives: sim.lives,
  };
  present('Opponent exit arranged');
};
$<HTMLButtonElement>('#runner-collision').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.wallContact = () => null;
  sim.sceneSweep = null;
  sim.blocked = () => false;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.projectiles = [];
  sim.score = 0;
  sim.scrub.active = false;
  sim.scrubbing = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.dead = Infinity;
  });
  const p = sim.runners[sim.player],
    q = sim.runners[(sim.player + 1) % 8];
  Object.assign(p, { dead: 0, x: 100, y: 0, z: 100, yaw: 0, speed: 60 });
  Object.assign(q, { dead: 0, x: 100, y: 0, z: 92, yaw: Math.PI, speed: 60 });
  poseReference = null;
  scenario = {
    kind: 'runner collision diagnostic',
    target: q.id,
    ai: false,
    ground: 'flat diagnostic ground',
    walls: false,
    bounds:
      'provisional four-unit runner contact; load/reset restores domain geometry',
  };
  present('Runner collision arranged');
};
$<HTMLButtonElement>('#wreck').onclick = () => {
  if (!sim || busy) {
    return;
  }
  resetTransition();
  effects.clearBursts();
  sim.ai = () => ({});
  sim.ground = () => 0;
  sim.seed = 1996;
  sim.phase = 'running';
  sim.countdown = 0;
  sim.projectiles = [];
  sim.time = 300;
  sim.score = 0;
  sim.scrubbing = false;
  sim.scrub.active = false;
  sim.runners.forEach((r) => {
    sim.spawn(r);
    r.kills = 0;
    r.dead = Infinity;
  });
  sim.seed = 1996;
  const p = sim.runners[sim.player],
    q = sim.runners[(sim.player + 1) % 8];
  Object.assign(p, {
    dead: 0,
    x: 100,
    y: 0,
    z: 100,
    yaw: 0,
    weapons: [null],
    selectedWeapon: 0,
    weapon: null,
  });
  Object.assign(q, { dead: 0, x: 100, y: 0, z: 60, yaw: Math.PI });
  sim.damage(q, 10000, sim.player);
  sim.checkRunnerHealth(q);
  poseReference = null;
  scenario = {
    kind: 'wreck diagnostic',
    target: q.id,
    ai: false,
    seed: 1996,
    ground: 'flat diagnostic ground; reset restores domain ground',
  };
  present('Wreck arranged', sim.events);
};
$<HTMLButtonElement>('#scrub').onclick = () => {
  if (!sim) {
    return;
  }
  sim.time = 0;
  advance('Scrub started', 1);
};
$<HTMLButtonElement>('#hot-spot').onclick = () => {
  if (!sim || busy || !sim.hotSpots.spots.length) {
    return;
  }
  resetTransition();
  const spot =
    sim.hotSpots.spots.find((s) => !s.alwaysArmed) || sim.hotSpots.spots[0];
  sim.ai = () => ({});
  sim.phase = 'running';
  sim.countdown = 0;
  sim.time = 300;
  sim.scrubbing = false;
  sim.scrub.active = false;
  sim.projectiles = [];
  effects.clearBursts();
  sim.runners.forEach((r) => {
    r.dead = Infinity;
    r.ionSeconds = 0;
  });
  const p = sim.runners[sim.player];
  Object.assign(p, {
    x: spot.x,
    y: spot.y,
    z: spot.z + 20,
    yaw: 0,
    speed: 0,
    turn: 0,
    acceleration: 0,
    turnAcceleration: 0,
    vy: 0,
    localVerticalSpeed: 0,
    frontVelocity: 0,
    sideVelocity: 0,
    chassisPitchDegrees: 0,
    chassisRollDegrees: 0,
    collisionProbe: { x: spot.x, y: spot.y, z: spot.z + 20 },
    rearProbe: { x: spot.x, y: spot.y, z: spot.z + 20 },
    previousPosition: { x: spot.x, y: spot.y, z: spot.z + 20 },
    health: 100,
    shield: 8,
    dead: 0,
  });
  Object.assign(spot, {
    phase: spot.alwaysArmed ? 1 : 0,
    scale: 1,
    seconds: 2,
  });
  view.setHotSpotState(spot);
  rear = false;
  $<HTMLButtonElement>('#rear').textContent = 'View back';
  poseReference = null;
  scenario = { kind: 'hot spot diagnostic', spot: spot.id, ai: false };
  present('Hot spot arranged');
};
$<HTMLButtonElement>('#hit-hot-spot').onclick = () => {
  if (!sim || busy || scenario?.kind !== 'hot spot diagnostic') {
    return;
  }
  const s = sim.hotSpots.spots[scenario.spot!],
    action = sim.hotSpots.trigger(s, sim.player);
  present('Hot spot ' + (action || 'already erupting'));
};
$<HTMLButtonElement>('#approach-portal').onclick = () => {
  if (!sim || busy) {
    return;
  }
  const id = $<HTMLSelectElement>('#portal').value,
    pose = view.portalApproach(id);
  if (!pose) {
    return;
  }
  resetTransition();
  sim.phase = 'running';
  sim.countdown = 0;
  sim.ai = () => ({});
  sim.runners.forEach((r) => {
    r.dead = Infinity;
  });
  const p = sim.runners[sim.player];
  Object.assign(p, pose, {
    dead: 0,
    inactive: false,
    movementEnabled: true,
    health: 100,
    shield: 8,
    speed: 0,
    turn: 0,
    acceleration: 0,
    turnAcceleration: 0,
    vy: 0,
    collisionProbe: { x: pose.x, y: pose.y, z: pose.z },
    rearProbe: { x: pose.x, y: pose.y, z: pose.z },
    previousPosition: { x: pose.x, y: pose.y, z: pose.z },
  });
  poseReference = null;
  scenario = {
    kind: 'portal approach',
    portal: id,
    ai: false,
    initialPose: { ...pose },
  };
  rear = false;
  $<HTMLButtonElement>('#rear').textContent = 'View back';
  present('Portal ' + id + ' arranged');
};
$<HTMLButtonElement>('#approach-secret-door').onclick = () => {
  if (!sim || busy) {
    return;
  }
  const key = $<HTMLSelectElement>('#secret-door').value,
    pose = view.secretDoorApproach(key);
  if (!pose) {
    return;
  }
  resetTransition();
  sim.phase = 'running';
  sim.countdown = 0;
  sim.ai = () => ({});
  sim.runners.forEach((r) => {
    r.dead = Infinity;
  });
  const p = sim.runners[sim.player];
  Object.assign(p, pose, {
    dead: 0,
    inactive: false,
    movementEnabled: true,
    health: 100,
    shield: 8,
    speed: 0,
    turn: 0,
    acceleration: 0,
    turnAcceleration: 0,
    vy: 0,
    keyring: { x: false, y: false, z: false },
    collisionProbe: { x: pose.x, y: pose.y, z: pose.z },
    rearProbe: { x: pose.x, y: pose.y, z: pose.z },
    previousPosition: { x: pose.x, y: pose.y, z: pose.z },
  });
  poseReference = null;
  scenario = {
    kind: 'secret door approach',
    key,
    ai: false,
    initialPose: { ...pose },
  };
  rear = false;
  $<HTMLButtonElement>('#rear').textContent = 'View back';
  present('Secret door ' + key.toUpperCase() + ' arranged without key');
};
$<HTMLButtonElement>('#collect-door-key').onclick = () => {
  if (!sim || busy) {
    return;
  }
  const key = $<HTMLSelectElement>('#secret-door').value;
  if (!key) {
    return;
  }
  sim.events = [];
  sim.collect(sim.runners[sim.player], { type: 'enhkey' + key + '.gam' });
  present('Key ' + key.toUpperCase() + ' collected', sim.events);
};
document.querySelectorAll<HTMLElement>('[data-secondary]').forEach(
  (button) =>
    (button.onclick = () => {
      if (!sim || busy) {
        return;
      }
      resetTransition();
      const weapon = button.dataset.secondary;
      effects.clearBursts();
      sim.ai = () => ({});
      sim.ground = () => 0;
      sim.projectiles = [];
      sim.barrierTrails.states.forEach((s) => sim.barrierTrails.reset(s.owner));
      sim.barriers = [];
      sim.phase = 'running';
      sim.scrub.active = false;
      sim.scrubbing = false;
      sim.time = 300;
      sim.countdown = 0;
      sim.score = 0;
      sim.events = [];
      sim.runners.forEach((r) =>
        Object.assign(r, {
          health: 100,
          dead: Infinity,
          ionSeconds: 0,
          ionTarget: null,
          disrupted: 0,
          speed: 0,
          turn: 0,
          shield: 0,
          vy: 0,
          kills: 0,
        }),
      );
      const p = sim.runners[sim.player],
        q = sim.runners[(sim.player + 1) % 8];
      Object.assign(p, {
        dead: 0,
        x: 100,
        y: 0,
        z: 100,
        yaw: 0,
        fire: 0,
        weapons: [null, weapon],
        selectedWeapon: 1,
      });
      Object.assign(q, { dead: 0, x: 100, y: 0, z: 60, yaw: Math.PI });
      sim.selectWeapon(p);
      sim.secondary(p);
      poseReference = null;
      scenario = {
        weapon,
        target: q.id,
        ai: false,
        ground: 'flat diagnostic plane; reset to restore domain ground',
      };
      present('Activated ' + weapon, sim.events);
    }),
);
$<HTMLButtonElement>('#download').onclick = () => {
  const blob = new Blob(
      [
        JSON.stringify(
          { version: 1, tablesHash: GAME_TABLES.sha256, trace },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'deathdrome-verification.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
await load();
