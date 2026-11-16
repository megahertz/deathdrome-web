// New decoder for the disc's recorded demo data. These are original poses,
// not newly simulated gameplay; use them explicitly as comparison references.
export class RecordedDemo {
  declare date: string;
  declare controls: {
    time: number;
    words: number[];
    axes: number[];
  }[];
  declare tracks: any[][];
  declare duration: number;

  constructor(buffer: ArrayBuffer) {
    const data = new DataView(buffer),
      bytes = new Uint8Array(buffer);
    if (
      data.byteLength < 44 ||
      data.getUint32(0, true) !== 0x02265847 ||
      data.getUint32(8, true) !== 3
    ) {
      throw Error('Unsupported DeathDrome recording');
    }
    this.date = new TextDecoder()
      .decode(bytes.slice(12, 44))
      .split('\0')[0]
      .trim();
    this.controls = [];
    this.tracks = Array.from({ length: 8 }, () => []);
    this.duration = 0;
    let p = 44,
      ended = false;
    while (p < data.byteLength) {
      if (p + 8 > data.byteLength) {
        throw Error('Truncated recording header');
      }
      const kind = data.getUint32(p, true),
        time = data.getFloat32(p + 4, true) / 1000;
      p += 8;
      const size = { 0: 72, 1: 68, 2: 0 }[kind];
      if (size == null || p + size > data.byteLength) {
        throw Error('Invalid recording payload');
      }
      if (kind === 0) {
        this.controls.push({
          time,
          words: Array.from({ length: 14 }, (_, i) =>
            data.getUint32(p + i * 4, true),
          ),
          axes: Array.from({ length: 4 }, (_, i) =>
            data.getFloat32(p + 56 + i * 4, true),
          ),
        });
      } else if (kind === 1) {
        const f = (n: number) => data.getFloat32(p + n, true),
          id = data.getUint8(p + 60);
        if (id > 7) {
          throw Error('Invalid recorded runner');
        }
        this.tracks[id].push({
          time,
          health: f(0),
          x: f(4),
          y: f(8),
          z: f(12),
          yaw: f(16),
          pitch: f(20),
          roll: f(24),
          turnDegrees: f(28),
          velocity: [f(32), f(36), f(40)],
          jump: [f(44), f(48)],
          shotClock: f(52),
          score: data.getUint32(p + 56, true),
          id,
          kills: data.getUint8(p + 61),
          weaponPacked: data.getUint8(p + 62),
          keyFlags: data.getUint8(p + 64) & 7,
        });
      } else {
        this.duration = time;
        ended = true;
      }
      p += size;
    }
    if (!ended || this.tracks.some((t) => !t.length)) {
      throw Error('Incomplete recording');
    }
  }
  sample(seconds: number) {
    const time = Math.max(0, Math.min(seconds, this.duration));
    return this.tracks.map((track) => {
      let lo = 0,
        hi = track.length - 1;
      while (lo < hi) {
        const m = Math.ceil((lo + hi) / 2);
        if (track[m].time <= time) {
          lo = m;
        } else {
          hi = m - 1;
        }
      }
      const a = track[lo],
        b = track[Math.min(lo + 1, track.length - 1)],
        t =
          b.time > a.time
            ? Math.min(1, Math.max(0, (time - a.time) / (b.time - a.time)))
            : 0;
      const result = { ...a };
      for (const key of ['x', 'y', 'z']) {
        result[key] = a[key] + (b[key] - a[key]) * t;
      }
      result.yaw =
        a.yaw +
        ((Math.atan2(
          Math.sin(((b.yaw - a.yaw) * Math.PI) / 180),
          Math.cos(((b.yaw - a.yaw) * Math.PI) / 180),
        ) *
          180) /
          Math.PI) *
          t;
      return result;
    });
  }
}
