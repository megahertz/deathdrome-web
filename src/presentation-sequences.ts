const clamp = (n: number) => Math.max(0, Math.min(1, n));
// Map overlays use the two original 81x61 quadrant images, wiped from the
// centre outwards (4213f5 / 421489), with a half-second pause between them.
export const DOMAIN_TIMES = {
  split: 0.65,
  prepare: 0.95,
  map: 1.15,
  first: 1.65,
  second: 2.65,
  clearing: 3.65,
  fade: 7.15,
  scene: 7.65,
  end: 8.5,
};
export class DomainSequence {
  declare round: number;
  declare fromGo: boolean;
  declare onCue: (name: string) => void;
  declare seconds: number;
  declare cues: Set<string>;

  constructor({
    round = 1,
    fromGo = true,
    onCue = () => {},
  }: {
    round?: number;
    fromGo?: boolean;
    onCue?: (name: string) => void;
  } = {}) {
    this.round = round;
    this.fromGo = fromGo;
    this.onCue = onCue;
    this.seconds = 0;
    this.cues = new Set();
  }
  step(dt: number, ready = true) {
    this.seconds += Math.max(0, dt);
    // A slow resource load holds the preparing screen; it cannot consume the
    // unlocking animation or introduce the round before its models exist.
    if (!ready) {
      this.seconds = Math.min(this.seconds, DOMAIN_TIMES.map - 0.001);
    }
    const t = this.seconds,
      T = DOMAIN_TIMES;
    for (const [name, at] of [
      ['split', 0],
      ['map', T.map],
      ['unlock1', T.first],
      ['unlock2', T.second],
      ['clearing', T.clearing],
      ['fade', T.fade],
      ['scene', T.scene],
    ] as const) {
      if (t >= at && !this.cues.has(name)) {
        this.cues.add(name);
        this.onCue(name);
      }
    }
    return this.state();
  }
  state() {
    const t = this.seconds,
      T = DOMAIN_TIMES;
    let phase = 'scene';
    if (t < T.split) {
      phase = 'split';
    } else if (t < T.map) {
      phase = 'prepare';
    } else if (t < T.fade) {
      phase = 'map';
    } else if (t < T.scene) {
      phase = 'fade';
    }
    let black = 0;
    if (t >= T.scene) {
      black = 1 - clamp((t - T.scene) / (T.end - T.scene));
    } else if (t >= T.fade) {
      black = clamp((t - T.fade) / (T.scene - T.fade));
    }
    return {
      seconds: t,
      fromGo: this.fromGo,
      phase,
      split: clamp(t / T.split),
      mapScale:
        t < T.fade ? clamp((t - T.map) / 0.5) : 1 - clamp((t - T.fade) / 0.5),
      unlocks: [clamp((t - T.first) / 0.4), clamp((t - T.second) / 0.4)],
      textCharacters: Math.max(0, Math.floor((t - T.clearing) * 22)),
      logoFrame: 1 + (Math.floor(t * 12) % 8),
      black,
      finished: t >= T.end,
    };
  }
}
export { ResultSequence } from './result-sequence.ts';
// Enhancer icons rotate in their eight texture frames (enhcycle.gw). The
// carrier polygon stays facing the camera; spinning that polygon hides it.
export function pickupYaw(
  camera: import('./game-types.ts').Point2,
  pickup: import('./game-types.ts').Point2,
) {
  return Math.atan2(camera.x - pickup.x, camera.z - pickup.z);
}
