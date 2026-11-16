import { GAME_TABLES } from './game-tables.ts';
import type { Vec3 } from './game-types.ts';
import { NANO } from './nano-shield.ts';
import {
  THREE,
  modelData,
  makeModel,
  transformModelGeometry,
  runnerAttachmentMatrix,
  type View,
} from './renderer.ts';
import { RESPAWN } from './respawn.ts';
import { RUNNERS, type Simulation } from './simulation.ts';
import { emitterOrigins } from './weapon-emitters.ts';
const LASERS = ['red', 'blu', 'ylw', 'wht', 'prp', 'grn', 'pnk', 'org'].map(
  (c) => 'lzr' + c,
);
const BARRIERS = [
  'r_bar',
  'b_bar',
  'y_bar',
  'w_bar',
  'ppl_bar',
  'g_bar',
  'pnk_bar',
  'o_bar',
];

export class Effects {
  declare view: Pick<View, 'objects' | 'camera'>;
  declare models: Map<string, import('./model-types.ts').ModelData>;
  declare pools: Record<string, { name: string; mesh: THREE.Group }[]>;
  declare bursts: { mesh: THREE.Group; born: number }[];

  static async create(view: View) {
    const names = [
      ...LASERS,
      ...BARRIERS,
      ...RUNNERS,
      ...RUNNERS.map((_, i) => 'runrex_' + i),
      'nano',
      'plas_hit',
      'missile',
      'shockwav',
      'disruptr',
      'ionsword',
      'ionflare',
      'hotspot1',
      'hotspot2',
      'hotspot3',
      'fx_smexp',
      'fx_lgexp',
    ];
    const data = await Promise.all(
      names.map((itemValue) => modelData(itemValue)),
    );
    return new Effects(view, new Map(names.map((n, i) => [n, data[i]])));
  }
  constructor(
    view: Pick<View, 'objects' | 'camera'>,
    models: Map<string, import('./model-types.ts').ModelData>,
  ) {
    this.view = view;
    this.models = models;
    this.pools = {
      shots: [],
      barriers: [],
      ions: [],
      flares: [],
      hotSpots: [],
      shields: [],
      respawns: [],
      wrecks: [],
    };
    this.bursts = [];
  }
  instance(name: string) {
    const data = this.models.get(name)!;
    if (name.startsWith('runrex_')) {
      const group = new THREE.Group(),
        tokens = Object.keys(data.attachments!).filter((n) =>
          /^\d{3}_\d{2}$/.test(n),
        );
      group.add(
        makeModel(
          data,
          (f: { name: string }) =>
            !/\/(fire|dedbody|\d{3}_\d{2})\//.test(f.name),
        ),
      );
      for (const token of [...tokens, 'fire', 'dedbody']) {
        const part = makeModel(data, (f: { name: string | string[] }) =>
            f.name.includes('/' + token + '/'),
          ),
          attachment = data.attachments![token];
        const inverse = new THREE.Matrix4()
          .fromArray(attachment.matrix)
          .invert();
        transformModelGeometry(part, inverse);
        part.position.fromArray(attachment.position);
        part.userData.wreckPart = token;
        part.userData.attachment = attachment.matrix;
        group.add(part);
      }
      return group;
    }
    if (name === 'hotspot3') {
      const group = new THREE.Group(),
        spike = makeModel(
          data,
          (f: { name: string | string[] }) => !f.name.includes('/force/'),
        ),
        force = makeModel(data, (f: { name: string | string[] }) =>
          f.name.includes('/force/'),
        );
      force.userData.hotForce = true;
      spike.userData.hotSpike = true;
      group.add(spike, force);
      return group;
    }
    return makeModel(data);
  }
  slot(pool: string, index: number, name: string) {
    const list = this.pools[pool];
    let entry = list[index];
    if (entry?.name !== name) {
      if (entry) {
        this.view.objects.remove(entry.mesh);
        entry.mesh.traverse((o: import('./model-types.ts').RenderNode) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      }
      const mesh = this.instance(name);
      mesh.userData.enhancedGlow =
        ['barriers', 'ions', 'flares', 'shields'].includes(pool) ||
        (pool === 'shots' && name !== 'missile');
      list[index] = { name, mesh };
      entry = list[index];
      this.view.objects.add(mesh);
      if (pool === 'barriers') {
        mesh.scale.y = 0.65;
        mesh.traverse((o: import('./model-types.ts').RenderNode) => {
          if (o.material) {
            o.material!.side = THREE.DoubleSide;
          }
        });
      }
    }
    return entry.mesh;
  }
  burst(position: Vec3, large: boolean, seconds: number) {
    const mesh = this.instance(large ? 'fx_lgexp' : 'fx_smexp');
    mesh.userData.enhancedGlow = true;
    mesh.position.set(position.x, position.y + 1, position.z);
    // Original sprite sequences run at 7.8fps. Scale is still provisional.
    mesh.scale.setScalar(large ? 16 : 5);
    mesh.userData.born = seconds;
    mesh.traverse((o: import('./model-types.ts').RenderNode) => {
      if (o.material) {
        o.material!.side = THREE.DoubleSide;
      }
    });
    this.view.objects.add(mesh);
    this.bursts.push({ mesh, born: seconds });
  }
  clearBursts() {
    for (const { mesh } of this.bursts) {
      this.view.objects.remove(mesh);
      mesh.traverse((o: import('./model-types.ts').RenderNode) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this.bursts = [];
  }
  sync(sim: Simulation) {
    for (const [pool, items] of [
      ['shots', sim.projectiles.filter((p) => !p.pending && !p.hidden)],
      ['barriers', sim.barriers],
    ] as [string, any[]][]) {
      for (const [i, item] of items.entries()) {
        const name =
            pool === 'barriers'
              ? BARRIERS[item.owner]
              : {
                  Missile: 'missile',
                  ShockWave: 'shockwav',
                  Disruptor: 'disruptr',
                }[item.kind as 'Missile' | 'ShockWave' | 'Disruptor'] ||
                LASERS[item.owner],
          mesh = this.slot(pool, i, name);
        mesh.visible = true;
        if (pool === 'barriers') {
          mesh.position.set(0, 0.31, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.traverse((o: import('./model-types.ts').RenderNode) => {
            if (!o.geometry) {
              return;
            }
            const a = o.geometry.attributes.position;
            o.userData.sourceVertices ??= [...a.array];
            const source: number[] = o.userData.sourceVertices;
            for (let j = 0; j < a.count; j++) {
              const p =
                item.points[
                  Math.min(
                    item.points.length - 1,
                    Math.round(source[j * 3 + 2]),
                  )
                ];
              a.setXYZ(j, p.x, source[j * 3 + 1] > 0 ? 5 : 0, p.z);
            }
            a.needsUpdate = true;
            o.geometry.computeBoundingSphere();
          });
        } else {
          mesh.position.set(item.x, item.y, item.z);
          if (item.angles) {
            const a = item.angles,
              k = GAME_TABLES.combat.emitters.rotationPi / 180;
            mesh.rotation.set(a.pitch * k, a.yaw * k, a.roll * k, 'YXZ');
          } else {
            mesh.rotation.order = 'XYZ';
            mesh.rotation.x =
              item.kind === 'Missile'
                ? Math.atan2(item.dy || 0, Math.hypot(item.dx, item.dz))
                : 0;
            if (item.kind === 'ShockWave') {
              mesh.rotation.y = 0;
            } else if (item.kind === 'Disruptor') {
              mesh.rotation.y = item.rotation;
            } else {
              mesh.rotation.y = Math.atan2(-item.dx, -item.dz);
            }
          }
        }
        if (pool === 'shots') {
          mesh.scale.set(
            item.scale || 1,
            item.kind === 'ShockWave' ? 1 : item.scale || 1,
            item.scale || 1,
          );
        }
        if (pool === 'barriers') {
          mesh.traverse((o: import('./model-types.ts').RenderNode) => {
            if (o.material?.map) {
              o.material!.map.offset.y = -sim.elapsed * 5;
            }
          });
        }
      }
      for (const [i, entry] of this.pools[pool].entries()) {
        if (!entry) {
          continue;
        }

        if (i >= items.length) {
          entry.mesh.visible = false;
        }
      }
    }
    this.syncIons(sim);
    this.syncShields(sim);
    this.syncRespawns(sim);
    this.syncWrecks(sim);
    this.syncHotSpots(sim);
    this.bursts = this.bursts.filter((b) => {
      if (sim.elapsed + 7.1 - b.born >= 8 / 7.8) {
        this.view.objects.remove(b.mesh);
        b.mesh.traverse((o: import('./model-types.ts').RenderNode) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        return false;
      }
      b.mesh.quaternion.copy(this.view.camera.quaternion);
      return true;
    });
  }
  syncWrecks(sim: { wrecks: { states: any } }) {
    for (const e of this.pools.wrecks) {
      if (!e) {
        continue;
      }
      e.mesh.visible = false;
    }
    for (const w of sim.wrecks.states) {
      if (!w) {
        continue;
      }
      const mesh = this.slot('wrecks', w.runner, 'runrex_' + w.runner);
      mesh.visible = true;
      mesh.position.set(w.x, w.y, w.z);
      mesh.rotation.set(0, w.yaw, 0);
      mesh.userData.born = w.born + 7.1;
      const inverseYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -w.yaw,
      );
      for (const child of mesh.children) {
        const token = child.userData.wreckPart;
        if (!token) {
          continue;
        }
        if (token === 'fire' || token === 'dedbody') {
          child.visible = token === 'fire' || w.body.visible;
          child.quaternion
            .copy(inverseYaw)
            .multiply(this.view.camera.quaternion);
          if (token === 'dedbody') {
            const a = this.models.get('runrex_' + w.runner)!.attachments!
              .dedbody.position;
            child.position.set(a[0] + w.body.x, a[1], a[2] + w.body.z);
          }
        } else {
          const p = w.parts.find(
            (projectile: { name: string }) => projectile.name === token,
          );
          child.visible = p.visible;
          child.matrixAutoUpdate = false;
          child.matrix
            .fromArray(child.userData.attachment)
            .multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))
            .multiply(new THREE.Matrix4().makeRotationX((p.rx * Math.PI) / 180))
            .multiply(new THREE.Matrix4().makeRotationZ((p.rz * Math.PI) / 180))
            .multiply(new THREE.Matrix4().makeScale(p.scale, p.scale, p.scale));
        }
      }
    }
  }
  syncShields(sim: { runners: any; escape?: any }) {
    for (const e of this.pools.shields) {
      if (!e) {
        continue;
      }
      e.mesh.visible = false;
    }
    for (const r of sim.runners) {
      if (r.dead || r.shield <= 0 || !r.shieldPlanes) {
        continue;
      }
      const data = this.models.get(r.model)!;
      for (const [j, p] of r.shieldPlanes.entries()) {
        const mesh = this.slot('shields', r.id * 2 + j, 'nano');
        mesh.visible = true;
        mesh.matrixAutoUpdate = false;
        mesh.matrix
          .copy(runnerAttachmentMatrix(data, r, 'cockpit', sim.escape))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, p.z))
          .multiply(
            new THREE.Matrix4().makeScale(p.scale, p.scale, NANO.depthScale),
          );
      }
    }
  }
  syncRespawns(sim: Simulation) {
    for (const e of this.pools.respawns) {
      if (!e) {
        continue;
      }
      e.mesh.visible = false;
    }
    for (const r of sim.runners) {
      if (!r.respawn?.shroudVisible) {
        continue;
      }
      const mesh = this.slot('respawns', r.id, RESPAWN.model),
        data = this.models.get(r.model)!;
      mesh.visible = true;
      mesh.matrixAutoUpdate = false;
      mesh.matrix
        .copy(runnerAttachmentMatrix(data, r, RESPAWN.attachment, sim.escape))
        .multiply(
          new THREE.Matrix4().makeScale(
            RESPAWN.shroudScale,
            RESPAWN.shroudScale,
            RESPAWN.shroudScale,
          ),
        );
      mesh.traverse((o: import('./model-types.ts').RenderNode) => {
        if (o.material?.map) {
          o.material!.map.offset.set(
            (sim.elapsed + 7.1) * RESPAWN.scroll[0],
            (sim.elapsed + 7.1) * RESPAWN.scroll[1],
          );
        }
      });
    }
  }
  syncHotSpots(sim: { hotSpots: { spots: any } }) {
    const { spots } = sim.hotSpots;
    for (const [i, s] of spots.entries()) {
      const name = 'hotspot' + ([1, 2][s.phase] ?? 3),
        mesh = this.slot('hotSpots', i, name);
      mesh.visible = true;
      mesh.matrix.fromArray(s.matrix);
      mesh.matrixAutoUpdate = false;
      for (const child of mesh.children) {
        if (child.userData.hotForce) {
          child.scale.set(s.scale, 1, s.scale);
        }
        if (child.userData.hotSpike) {
          child.traverse((o: import('./model-types.ts').RenderNode) => {
            if (o.material) {
              o.material.color.setRGB(
                ...(s.color as [number, number, number]),
                THREE.SRGBColorSpace,
              );
            }
          });
        }
      }
    }
    for (const [i, e] of this.pools.hotSpots.entries()) {
      if (!e) {
        continue;
      }

      if (i >= spots.length) {
        e.mesh.visible = false;
      }
    }
  }
  syncIons(sim: Simulation) {
    const active = sim.runners.filter((r) => !r.dead && r.ionSeconds > 0);
    let flareIndex = 0;
    for (const [i, r] of active.entries()) {
      const mesh = this.slot('ions', i, 'ionsword'),
        s = Math.sin(r.yaw),
        c = Math.cos(r.yaw);
      const [left, right] = emitterOrigins(r, r.id === sim.player).map(
          (p) => new THREE.Vector3(p.x, p.y, p.z),
        ),
        q = sim.runners[r.ionTarget!];
      const end = q
        ? new THREE.Vector3(q.x, q.y + 1.5, q.z)
        : left
            .clone()
            .add(right)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(-s * 1.4, 0, -c * 1.4));
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      // Native 440ea0 bends both strips through their midpoint and joins their
      // tips at the target. Origins share the native laser emitter frames.
      mesh.traverse((o: import('./model-types.ts').RenderNode) => {
        if (!o.geometry) {
          return;
        }
        const attribute = o.geometry.attributes.position;
        o.userData.sourceVertices ??= [...attribute.array];
        const source: number[] = o.userData.sourceVertices;
        for (let j = 0; j < attribute.count; j++) {
          const x = source[j * 3],
            y = source[j * 3 + 1],
            z = source[j * 3 + 2],
            origin = x < 0 ? left : right;
          let point;
          if (z < -8.7) {
            point = end;
          } else if (z < -7) {
            point = origin.clone().lerp(end, 0.5);
          } else {
            point = origin;
          }

          attribute.setXYZ(
            j,
            point.x,
            point.y + (y > 0.5 ? 0.375 : -0.375),
            point.z,
          );
        }
        attribute.needsUpdate = true;
        o.geometry.computeBoundingSphere();
        o.material!.side = THREE.DoubleSide;
        if (o.material!.map) {
          o.material!.map.offset.x = sim.elapsed * 3;
        }
      });
      for (const point of [left, right, ...(q ? [end] : [])]) {
        const flare = this.slot('flares', flareIndex++, 'ionflare');
        flare.visible = true;
        flare.position.copy(point);
        flare.quaternion.copy(this.view.camera.quaternion);
        flare.scale.setScalar(point === end ? 5 : 1);
      }
    }
    for (const [i, e] of this.pools.ions.entries()) {
      if (!e) {
        continue;
      }

      if (i >= active.length) {
        e.mesh.visible = false;
      }
    }
    for (const [i, e] of this.pools.flares.entries()) {
      if (!e) {
        continue;
      }

      if (i >= flareIndex) {
        e.mesh.visible = false;
      }
    }
  }
}
