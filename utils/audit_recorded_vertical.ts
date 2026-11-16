import './tests/setup.ts';
// Component diagnostic only: inferred frame durations share original yaw data.
import { readFile, writeFile } from 'node:fs/promises';
import { RecordedDemo } from '../src/recorded-demo.ts';
import { updateVertical } from '../src/vertical.ts';
const root = new URL('../', import.meta.url),
  manifest = JSON.parse(
    (
      await readFile(new URL('private/assets/recordings/manifest.json', root))
    ).toString(),
  );
const reports = [];
for (const entry of manifest) {
  // oxlint-disable-next-line no-await-in-loop -- Keep each reference fixture and its assertions together, bounding live scene memory.
  const bytes = await readFile(
      new URL('private/assets/recordings/' + entry.file, root),
    ),
    demo = new RecordedDemo(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    track = demo.tracks[0],
    samples: {
      time: any;
      dt: number;
      positionError: number;
      verticalSpeedError: number;
    }[] = [];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1],
      b = track[i],
      delta =
        (Math.atan2(
          Math.sin(((b.yaw - a.yaw) * Math.PI) / 180),
          Math.cos(((b.yaw - a.yaw) * Math.PI) / 180),
        ) *
          180) /
        Math.PI,
      dt = delta / b.turnDegrees;
    if (
      !Number.isFinite(dt) ||
      dt < 0.01 ||
      dt > 0.09 ||
      a.y < 0.5 ||
      b.y < 0.5 ||
      Math.abs(a.pitch) > 1 ||
      Math.abs(b.pitch) > 1 ||
      a.health !== b.health ||
      Math.abs(a.y - b.y) < 0.00001
    ) {
      continue;
    }
    const r = { y: a.y, vy: a.velocity[1] };
    updateVertical(r, 0, dt);
    samples.push({
      time: b.time,
      dt,
      positionError: Math.abs(r.y - b.y),
      verticalSpeedError: Math.abs(r.vy - b.velocity[1]),
    });
  }
  const summary = (key: string) => {
    if (!samples.length) {
      return null;
    }
    const xs = samples
      .map((s) => s[key as keyof typeof s])
      .sort((a, b) => a - b);
    return {
      median: xs[Math.floor(xs.length * 0.5)],
      p90: xs[Math.floor(xs.length * 0.9)],
      maximum: xs.at(-1),
    };
  };
  reports.push({
    recording: entry.name,
    samples: samples.length,
    positionUnits: summary('positionError'),
    verticalSpeedUnitsPerSecond: summary('verticalSpeedError'),
    largestPositionDifferences: [...samples]
      .sort((a, b) => b.positionError - a.positionError)
      .slice(0, 5),
  });
}
const result = {
  status: 'diagnostic_only',
  method:
    'Warm-start each selected airborne step with native position and vertical velocity; infer dt from yaw change / native angular rate. Compare flat-ground explicit-Euler integration with no new jump.',
  limitations: [
    'Frame duration is inferred from original data, so this is not an independent trajectory-equivalence test',
    'Recorded velocities are transformed by native pitch; only pitch within one degree is selected',
    'This historical diagnostic still uses the legacy airborne helper; production now uses suspension.js, separately compared with native support actions',
    'Native variable frame rates change explicit-Euler jump height; the port currently uses fixed 60Hz steps',
  ],
  reports,
};
await writeFile(
  new URL('private/verification/recorded-vertical-audit.json', root),
  JSON.stringify(result, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify(
    reports.map((r) => ({
      recording: r.recording,
      samples: r.samples,
      position: r.positionUnits,
      velocity: r.verticalSpeedUnitsPerSecond,
    })),
  ) + '\n',
);
