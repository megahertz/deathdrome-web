import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AudioDirector, readOptions } from '../../src/audio-director.ts';
import { opponentHealthBar } from '../../src/hud.ts';
import { MENU_SOUNDS, drawMenuFrame } from '../../src/menu-presentation.ts';
import {
  DomainSequence,
  DOMAIN_TIMES,
  ResultSequence,
  pickupYaw,
} from '../../src/presentation-sequences.ts';
import { resultAdvance, visibleResultLabels } from '../../src/round-results.ts';
import { fixture as stateFixture } from './fixtures.ts';

function audioFixture() {
  const instances: {
    src: any;
    paused: boolean;
    volume: number;
    plays: number;
    pause(): void;
    play(): Promise<void>;
    cloneNode(): /*elided*/ any;
  }[] = [];
  const createAudio = (src: any) => {
    const a = Object.assign(new EventTarget(), {
      src,
      paused: true,
      volume: 1,
      plays: 0,
      pause() {
        this.paused = true;
      },
      play() {
        this.paused = false;
        this.plays++;
        return Promise.resolve();
      },
      cloneNode() {
        return createAudio(src);
      },
    });
    instances.push(a);
    return a;
  };
  const director = new AudioDirector({
    createAudio: (src) => createAudio(src) as unknown as HTMLAudioElement,
  });
  return { director, instances };
}
test('first gesture starts menu CD music and opening sound, M preserves effects and resumes the same track', () => {
  const { director: a, instances } = audioFixture();
  a.playMusic(11);
  a.sound('compopen');
  assert.ok(a.music!.paused);
  assert.equal(instances.length, 1);
  a.unlock();
  assert.equal(a.music!.paused, false);
  assert.equal(instances.at(-1)!.src, 'assets/audio/compopen.wav');
  const { music } = a;
  a.toggleMusic();
  assert.equal(music!.paused, true);
  a.sound('youexit');
  assert.equal(instances.at(-1)!.paused, false);
  a.toggleMusic();
  assert.equal(a.music, music);
  assert.equal(music!.paused, false);
  a.playMusic(3);
  assert.equal(music!.paused, true);
  assert.equal(a.music!.src, 'assets/audio/track03.ogg');
});
test('muting updates already playing effects, volumes persist independently and malformed settings are bounded', () => {
  const { director: a } = audioFixture();
  a.unlock();
  a.playMusic(11);
  const effect = a.sound('compopen');
  a.setMuted(true);
  assert.equal(effect!.volume, 0);
  assert.equal(a.music!.paused, true);
  a.setOption('sfxVolume', 2);
  a.setOption('musicVolume', 3);
  a.setMuted(false);
  assert.equal(effect!.volume, (0.6 * 2) / 9);
  assert.ok(a.music!.volume > 0);
  assert.equal(a.options.musicEnabled, true);
  assert.equal(readOptions(null).detail, 9);
  assert.equal(
    readOptions({ detail: 100, brightness: -5, musicVolume: Number.NaN })
      .detail,
    9,
  );
  assert.equal(readOptions({ brightness: -5 }).brightness, 0);
});
test('background suspension resumes the same music position and respects M, mute and zero volume', () => {
  const { director: a } = audioFixture();
  a.unlock();
  a.playMusic(11);
  const { music } = a;
  music!.currentTime = 23;
  a.setSuspended(true);
  assert.equal(music!.paused, true);
  a.setSuspended(false);
  assert.equal(music!.paused, false);
  assert.equal(a.music, music);
  assert.equal(music!.currentTime, 23);
  a.toggleMusic();
  a.setSuspended(true);
  a.setSuspended(false);
  assert.equal(music!.paused, true);
  a.toggleMusic();
  a.setMuted(true);
  a.setSuspended(true);
  a.setSuspended(false);
  assert.equal(music!.paused, true);
  a.setMuted(false);
  a.setOption('musicVolume', 0);
  a.setSuspended(true);
  a.setSuspended(false);
  assert.equal(music!.paused, true);
});
test('a gate plays low_end on opening and final closure without a new effect every moving frame', () => {
  const { director: a, instances } = audioFixture();
  a.unlock();
  a.door('11', 0, 1, 1);
  for (let i = 1; i < 15; i++) {
    a.door('11', i, i + 1, 1 + i / 60);
  }
  a.door('11', 15, 14, 2);
  a.door('11', 1, 0, 3);
  const plays = instances.filter((i) => i.plays > 0);
  assert.deepEqual(
    plays.map((i) => i.src),
    ['assets/audio/low_end.wav', 'assets/audio/low_end.wav'],
  );
  a.doorSounds.clear();
  a.door('11', 0, 1, 0);
  assert.equal(instances.filter((i) => i.plays > 0).length, 3);
});
test('slow model loading holds preparation and preserves both unlocks, clearing voice, fade and round order', () => {
  const cues: string[] = [],
    s = new DomainSequence({ onCue: (cue: any) => cues.push(cue) });
  for (let i = 0; i < 100; i++) {
    s.step(0.1, false);
  }
  assert.equal(s.state().phase, 'prepare');
  assert.deepEqual(cues, ['split']);
  for (let i = 0; i < 100; i++) {
    s.step(0.1, true);
  }
  assert.deepEqual(cues, [
    'split',
    'map',
    'unlock1',
    'unlock2',
    'clearing',
    'fade',
    'scene',
  ]);
  assert.equal(s.state().finished, true);
  s.step(1);
  assert.equal(cues.length, 7);
});
test('unlocks are separate progressive wipes and scene is still covered at the handoff', () => {
  const s = new DomainSequence();
  s.step(DOMAIN_TIMES.first + 0.2);
  assert.ok(s.state().unlocks[0] > 0.49 && s.state().unlocks[0] < 0.51);
  assert.equal(s.state().unlocks[1], 0);
  s.step(DOMAIN_TIMES.scene - s.seconds);
  assert.equal(s.state().phase, 'scene');
  assert.equal(s.state().black, 1);
  s.step(0.4);
  assert.ok(s.state().black > 0 && s.state().black < 1);
});
test('results reveal each row with exactly one cue; a fresh arbitrary key can always continue once', () => {
  const cues: string[] = [],
    s = new ResultSequence({ onRow: (row: any) => cues.push(row) });
  assert.equal(s.step(0.4), 0);
  assert.equal(s.step(0.1), 0);
  assert.equal(s.step(1 / 60), 1);
  assert.equal(s.step(1), 2);
  assert.equal(s.step(10), 3);
  assert.deepEqual(cues, [1, 2, 3]);
  s.step(10);
  assert.equal(cues.length, 3);
  let next = 0;
  const advance = resultAdvance(() => next++);
  assert.equal(advance({ code: 'KeyA', repeat: true }), false);
  assert.equal(advance({ code: 'KeyA', repeat: false }), true);
  assert.equal(advance({ code: 'Enter' }), false);
  assert.equal(next, 1);
  const loss = new ResultSequence({ win: false, onRow: (_row: any) => {} });
  assert.equal(loss.step(10), 1);
});
test('only the current statistics number blinks, then settles permanently', () => {
  const s = new ResultSequence();
  s.step(31 / 60);
  assert.equal(s.flashingRow, 1);
  assert.equal(s.numberVisible, false);
  s.step(1 / 60);
  assert.equal(s.numberVisible, true);
  s.step(4 / 60);
  assert.equal(s.numberVisible, false);
  s.step(1);
  assert.equal(s.flashingRow, 2);
  s.step(20);
  assert.equal(s.flashingRow, 0);
  assert.equal(s.numberVisible, true);
});
test('enhancer carrier faces the viewer from all directions, including a nearby camera', () => {
  const p = { x: 5, z: 8 };
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.001, 0.001],
  ]) {
    const yaw = pickupYaw(
        {
          x: p.x + dx,
          z: p.z + dz,
        } as unknown as import('../../src/game-types.ts').Vec3,
        p,
      ),
      length = Math.hypot(dx, dz);
    assert.ok(Math.abs(Math.sin(yaw) - dx / length) < 1e-12);
    assert.ok(Math.abs(Math.cos(yaw) - dz / length) < 1e-12);
  }
});
test('health bar endpoints match the original x87 conversion at full, partial and near-zero health', async () => {
  const audit = JSON.parse(
    await readFile(
      new URL(
        '../../private/verification/opponent-health-bars-native.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const sample of audit.samples) {
    assert.deepEqual(
      opponentHealthBar(sample.health),
      sample.bar,
      String(sample.health),
    );
  }
});
test('menu movement and entry resolve their original menu bank IDs, independently of the gameplay sound bank', async () => {
  const bytes = await readFile(
    new URL('../../private/original/game/RUN/ddrome.exe', import.meta.url),
  );
  const sourceName = (base: number, id: number) => {
    const offset = base - 0x48_00_00 + 0x6_8e_00 + 64 * id + 4,
      end = bytes.indexOf(0, offset);
    return bytes
      .subarray(offset, end)
      .toString()
      .split('\\')
      .at(-1)!
      .replace('.wav', '');
  };
  assert.equal(MENU_SOUNDS.enter, sourceName(0x48_d2_d8, 0));
  assert.equal(MENU_SOUNDS.move, sourceName(0x48_d2_d8, 3));
  assert.equal(MENU_SOUNDS.back, sourceName(0x48_d2_d8, 2));
  assert.equal(sourceName(0x48_bf_d8, 11), 'pla_hit');
  assert.equal(sourceName(0x48_bf_d8, 32), 'low_end');
});
test('menu border uses the original five-pixel strips and four corners around the expanding centre', () => {
  const draws: {
      name: unknown;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
    }[] = [],
    g = stateFixture<CanvasRenderingContext2D>({
      clearRect() {},
      drawImage(
        im: CanvasImageSource,
        x: number,
        y: number,
        w?: number,
        h?: number,
      ) {
        draws.push({
          name: (im as unknown as { name: string }).name,
          x,
          y,
          w,
          h,
        });
      },
    });
  drawMenuFrame(g, 0.75, (name) => ({ name, complete: true, naturalWidth: 5 }));
  assert.deepEqual(draws[0], { name: 'scrubyl', x: 37, y: 18, w: 5, h: 164 });
  assert.deepEqual(draws[1], { name: 'scrubyr', x: 278, y: 18, w: 5, h: 164 });
  assert.equal(draws.filter((d) => d.name === 'scrubcor').length, 4);
  assert.equal(draws[2].name, 'scrubxu');
  assert.equal(draws[3].name, 'scrubxb');
});

test('original total is present with the first bonus row and gains the time bonus on the next row', () => {
  const sim = stateFixture<import('../../src/simulation.ts').Simulation>({
    arena: 1,
    round: 1,
    score: 8630,
    roundBonus: { kills: 2000, time: 1330, credits: 0 },
  });
  let labels = visibleResultLabels(sim, { rows: 1 });
  assert.ok(labels.some((l) => l.y === 175 && l.value === '7300'));
  assert.ok(!labels.some((l) => l.y === 95));
  labels = visibleResultLabels(sim, { rows: 2 });
  assert.ok(labels.some((l) => l.y === 175 && l.value === '8630'));
  assert.ok(labels.some((l) => l.y === 95 && l.value === '1330'));
  labels = visibleResultLabels(sim, {
    rows: 3,
    flashingRow: 3,
    numberVisible: false,
  });
  assert.ok(
    labels.some((l) => l.y === 125 && l.value === 'EXTRA LIFE CREDITS'),
  );
  assert.ok(!labels.some((l) => l.y === 125 && l.x === 225));
  assert.ok(labels.some((l) => l.y === 175 && l.value === '8630'));
});
