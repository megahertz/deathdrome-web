interface HotSpot {
  id: number;
  x: number;
  y: number;
  z: number;
  matrix: number[];
  box: ReturnType<typeof hotSpotBox>;
  alwaysArmed: boolean;
  phase: number;
  seconds: number;
  scale: number;
  color: number[];
  owner: number | null;
}
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
import { hotSpotMarkers, hotSpotBox } from './hot-spot-geometry.ts';
import { intersectBox } from './scene-boxes.ts';
import { segmentInWorldPartition } from './world-partition.ts';
export const HOT_SPOT = GAME_TABLES.hotSpots;
export class HotSpots {
  declare onChange: (spot: HotSpot) => void;
  declare spots: HotSpot[];

  constructor(
    markers: import('./game-types.ts').Marker[] = [],
    onChange: (spot: HotSpot) => void = () => {},
  ) {
    this.onChange = onChange;
    let armedSeconds = 1;
    this.spots = hotSpotMarkers(markers).map((m, id) => {
      const armed = m.name === 'activ_hs.gam',
        seconds = armed ? armedSeconds : 0;
      if (armed) {
        armedSeconds = Math.fround(armedSeconds + 0.4);
      }
      return {
        id,
        x: m.position[0],
        y: m.position[1],
        z: m.position[2],
        matrix: m.matrix,
        box: hotSpotBox(m),
        alwaysArmed: armed,
        phase: armed ? 1 : 0,
        seconds,
        scale: 1,
        color: [1, 0, 0],
        owner: null,
      };
    });
  }
  trigger(spot: HotSpot, owner: number) {
    spot.owner = owner;
    if (spot.phase === 0) {
      spot.phase = 1;
      spot.seconds = 2;
      this.onChange(spot);
      return 'armed';
    }
    if (spot.phase !== 1) {
      return null;
    }
    if (
      this.spots.filter((s: HotSpot) => s.phase >= 2).length >=
      HOT_SPOT.maximumEruptions
    ) {
      spot.seconds = 2;
      return null;
    }
    Object.assign(spot, {
      phase: 2,
      seconds: HOT_SPOT.flashSeconds,
      scale: 1,
      color: [1, 0, 0],
    });
    this.onChange(spot);
    return 'erupting';
  }
  step(dt: number) {
    for (const s of this.spots) {
      if (s.phase < 2) {
        continue;
      }
      const oldPhase = s.phase;
      s.seconds -= dt;
      if (s.phase === 2) {
        if (s.seconds <= 0) {
          s.phase = 3;
          s.seconds = HOT_SPOT.growthSeconds;
          s.color = [1, 1, 1];
        } else {
          s.color = [
            1,
            1 - s.seconds / HOT_SPOT.flashSeconds,
            1 - s.seconds / HOT_SPOT.flashSeconds,
          ];
        }
      } else if (s.phase === 3) {
        if (s.seconds <= 0) {
          s.phase = 4;
          s.seconds = 0;
        } else {
          s.scale = Math.min(
            HOT_SPOT.maximumScale,
            s.scale + (HOT_SPOT.growthDistance / HOT_SPOT.growthSeconds) * dt,
          );
        }
      } else {
        Object.assign(s, {
          phase: s.alwaysArmed ? 1 : 0,
          seconds: s.alwaysArmed ? 2 : 0,
          scale: 1,
          color: [1, 0, 0],
        });
      }
      if (s.phase !== oldPhase) {
        this.onChange(s);
      }
    }
  }
  markerContact(
    s: HotSpot,
    r: Pick<Runner, 'dead' | 'x' | 'y' | 'z'> & Partial<Runner>,
  ) {
    return (
      !r.dead &&
      s.phase < 2 &&
      Math.abs(r.x - s.x) < 3.5 &&
      Math.abs(r.z - s.z) < 3.5 &&
      r.y < s.y + 2.25 &&
      r.y + 2 > s.y
    );
  }
  forceContact(
    s: HotSpot,
    r: Pick<Runner, 'dead' | 'x' | 'y' | 'z'> & Partial<Runner>,
  ) {
    return (
      !r.dead &&
      s.phase >= 2 &&
      Math.abs(r.y - s.y - HOT_SPOT.forceHeight) <= HOT_SPOT.verticalBand &&
      Math.hypot(r.x - s.x, r.z - s.z) < HOT_SPOT.forceRadius * s.scale + 2
    );
  }
  projectileContact(s: HotSpot, a: any, b: any) {
    if (s.phase >= 2) {
      return false;
    }
    return segmentInWorldPartition(s.box, a, b) && !!intersectBox(s.box, a, b);
  }
}
