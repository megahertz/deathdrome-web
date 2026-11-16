import { GAME_TABLES } from './game-tables.ts';
import type { GroundQuery } from './game-types.ts';

// EKEY.C, functions 43e014 / 43de04 / 43df44 / 43e324. Paths retain
// the original DXF vertex order. Collision radius still needs measurement.
export class RechargeOrbs {
  declare paths: number[][][];
  declare ground: GroundQuery;
  declare settings: {
    count: number;
    speed: number;
  };
  declare nextPath: number;
  declare nextVertex: number;
  declare orbs: {
    id: number;
    cooldown: number;
    path: number;
    vertex: number;
    x: number;
    y: number;
    z: number;
  }[];

  constructor({
    arena = 1,
    round = 1,
    paths = [],
    ground = () => 0,
  }: {
    arena?: number;
    round?: number;
    paths?: number[][][];
    ground?: GroundQuery;
  } = {}) {
    this.paths = paths;
    this.ground = ground;
    this.settings = GAME_TABLES.recharge.rounds[arena - 1][round - 1];
    this.nextPath = 0;
    this.nextVertex = 0;
    this.orbs = paths.length
      ? Array.from({ length: this.settings.count }, (_, id) => ({
          id,
          cooldown: 0,
          path: -1,
          vertex: 0,
          x: 0,
          y: 0,
          z: 0,
        }))
      : [];
    for (const orb of this.orbs) {
      this.place(orb);
    }
  }
  place(orb: {
    id?: number;
    cooldown: any;
    path?: any;
    vertex?: any;
    x?: any;
    y?: any;
    z?: any;
  }) {
    const occupied = new Set(
      this.orbs
        .filter((o: { cooldown: number }) => o !== orb && o.cooldown <= 0)
        .map((o) => o.path),
    );
    let path = this.nextPath;
    for (
      let tries = 0;
      occupied.has(path) && tries < this.paths.length;
      tries++
    ) {
      path = (path + 1) % this.paths.length;
    }
    orb.path = path;
    orb.vertex = this.nextVertex++ % this.paths[path].length;
    orb.cooldown = 0;
    const [x, , z] = this.paths[path][orb.vertex];
    orb.x = x;
    orb.z = z;
    orb.y = this.ground(x, z, 200);
    this.nextPath = (path + 1) % this.paths.length;
  }
  step(dt: number) {
    for (const orb of this.orbs) {
      if (orb.cooldown > 0) {
        orb.cooldown -= dt;
        if (orb.cooldown <= 0) {
          this.place(orb);
        }
        continue;
      }
      const route = this.paths[orb.path];
      let remaining = dt * this.settings.speed;
      while (remaining > 0) {
        const next = (orb.vertex + 1) % route.length,
          [x, , z] = route[next],
          length = Math.hypot(x - orb.x, z - orb.z);
        if (length <= remaining) {
          orb.x = x;
          orb.z = z;
          orb.vertex = next;
          remaining -= length;
          if (length === 0) {
            break;
          }
        } else {
          orb.x += ((x - orb.x) * remaining) / length;
          orb.z += ((z - orb.z) * remaining) / length;
          remaining = 0;
        }
      }
      orb.y = this.ground(orb.x, orb.z, 200);
    }
  }
  collect(orb: { cooldown: number }) {
    orb.cooldown = GAME_TABLES.recharge.respawnSeconds;
  }
}
