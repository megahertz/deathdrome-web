import './diagnostic-setup.ts';
import { AudioDirector } from '../../src/audio-director.ts';
import { drawDomainIntro } from '../../src/domain-presentation.ts';
import { GAME_TABLES } from '../../src/game-tables.ts';
import { drawMenuFrame } from '../../src/menu-presentation.ts';
import {
  DomainSequence,
  ResultSequence,
} from '../../src/presentation-sequences.ts';
import { drawRoundResults } from '../../src/round-results.ts';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error('Missing diagnostic element: ' + selector);
    }
    return element;
  },
  g = $<HTMLCanvasElement>('#screen').getContext('2d')!;
g.setTransform(2, 0, 0, 2, 0, 0);
const pictures = new Map(),
  picture = (path: string) => pictures.get(path),
  audio = new AudioDirector();
let sequence: DomainSequence | null = null,
  result: ResultSequence | null = null,
  rows: number | null = null,
  fixedTime: number | null = 5,
  trace: string[] = [],
  previous = 0,
  showFrame = false;
for (const [i, d] of GAME_TABLES.domains.entries()) {
  const option = document.createElement('option');
  option.value = String(i + 1);
  option.textContent = d.name;
  $<HTMLSelectElement>('#domain').append(option);
}
const paths = [
  'images/dombak1',
  'images/domtitle',
  ...['scrubyl', 'scrubyr', 'scrubxu', 'scrubxb', 'scrubcor'].map(
    (n) => 'images/' + n,
  ),
  'images/dombak2',
  'images/go_title',
  'images/dd',
  'images/dombak4',
  ...Array.from({ length: 8 }, (_, i) =>
    Array.from(
      { length: 5 },
      (_unused, q) => `images/sp_a${i + 1}${q ? 'q' + q : ''}`,
    ),
  ).flat(),
  ...['grey', 'red', 'whit'].map((c) => 'fonts/10x_' + c),
];
await Promise.all(
  paths.map(
    (path) =>
      new Promise((resolve) => {
        const im = new Image();
        im.addEventListener('error', resolve);
        im.addEventListener('load', resolve);
        im.src = 'assets/' + path + '.png';
        pictures.set(path, im);
      }),
  ),
);
const snapshot = document.createElement('canvas');
snapshot.width = 320;
snapshot.height = 200;
const sg = snapshot.getContext('2d')!;
sg.drawImage(picture('images/dombak2'), 0, 0, 320, 200);
sg.drawImage(picture('images/go_title'), 54, 6, 214, 33);
const roundSnapshot = document.createElement('canvas');
roundSnapshot.width = 320;
roundSnapshot.height = 200;
const roundSnapshotContext = roundSnapshot.getContext('2d')!;
function resultFixture() {
  return [
    { score: 8630, roundBonus: { kills: 2000, time: 1330, credits: 0 } },
    { score: 23_140, roundBonus: { kills: 3000, time: 640, credits: 1 } },
    { score: 40_830, roundBonus: { kills: 20_000, time: 1330, credits: 2 } },
  ][Number($<HTMLSelectElement>('#result-credit').value)];
}
$<HTMLSelectElement>('#result-credit').addEventListener('change', () => {
  showFrame = false;
  sequence = null;
  result = null;
  fixedTime = null;
  rows = 3;
});
function introOptions() {
  return {
    round: Number($<HTMLSelectElement>('#round').value),
    fromGo: $<HTMLSelectElement>('#start-origin').value === 'go',
  };
}
$<HTMLSelectElement>('#start-origin').addEventListener('change', () => {
  showFrame = false;
  rows = null;
  result = null;
  sequence = null;
  fixedTime = 0.3;
});
function cue(name: string) {
  trace.push(name);
  $('#cues').textContent = 'События: ' + trace.join(' → ');
  const sounds = {
    split: 'compclse',
    map: 'compopen',
    unlock1: 'wea_clik',
    unlock2: 'wea_clik',
    clearing:
      Number($<HTMLSelectElement>('#round').value) === 1
        ? 'crimprep'
        : 'prepnext',
    fade: 'compclse',
    scene: 'round' + $<HTMLSelectElement>('#round').value,
  };
  audio.sound(sounds[name as keyof typeof sounds]);
}
$<HTMLButtonElement>('#intro').addEventListener('click', () => {
  showFrame = false;
  audio.unlock();
  trace = [];
  rows = null;
  result = null;
  fixedTime = null;
  sequence = new DomainSequence({ ...introOptions(), onCue: cue });
});
const showFixedTime = (button: HTMLElement) => {
  showFrame = false;
  rows = null;
  result = null;
  sequence = null;
  fixedTime = Number(button.dataset.time);
};
for (const b of document.querySelectorAll<HTMLElement>('[data-time]')) {
  b.addEventListener('click', () => showFixedTime(b));
}
$<HTMLButtonElement>('#results').addEventListener('click', () => {
  showFrame = false;
  audio.unlock();
  trace = [];
  sequence = null;
  fixedTime = null;
  result = new ResultSequence({
    onRow: (n: number) => {
      trace.push('row ' + n);
      $('#cues').textContent = 'События: ' + trace.join(' → ');
      audio.sound('pla_hit');
    },
  });
  rows = 0;
});
const showFixedRows = (button: HTMLElement) => {
  showFrame = false;
  sequence = null;
  result = null;
  fixedTime = null;
  rows = Number(button.dataset.rows);
};
for (const b of document.querySelectorAll<HTMLElement>('[data-rows]')) {
  b.addEventListener('click', () => showFixedRows(b));
}
$<HTMLButtonElement>('#menu-frame').addEventListener('click', () => {
  showFrame = true;
});
const frameCanvas = document.createElement('canvas');
frameCanvas.width = 320;
frameCanvas.height = 200;
const frameG = frameCanvas.getContext('2d')!;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - previous) / 1000 || 0);
  previous = now;
  const arena = Number($<HTMLSelectElement>('#domain').value),
    round = Number($<HTMLSelectElement>('#round').value);
  if (showFrame) {
    g.drawImage(picture('images/dombak1'), 0, 0, 320, 200);
    g.drawImage(picture('images/domtitle'), 54, 6, 214, 33);
    drawMenuFrame(frameG, 0.75, (n) => picture('images/' + n));
    g.drawImage(frameCanvas, 0, 0);
    $('#state').textContent =
      'Исходная сине-белая рамка: 75% расширения из центра';
    return;
  }
  if (rows !== null) {
    if (result) {
      rows = result.step(dt);
    }
    drawRoundResults(
      g,
      resultFixture() as unknown as import('../../src/simulation.ts').Simulation,
      {
        picture,
        win: true,
        arena,
        round,
        rows,
        flashingRow: result?.flashingRow ?? 0,
        numberVisible: result?.numberVisible ?? true,
      },
    );
    $('#state').textContent =
      'Статистика: строк ' +
      rows +
      ' из 3; бонус жизней: ' +
      resultFixture().roundBonus.credits;
    return;
  }
  const state = sequence
    ? sequence.step(dt)
    : Object.assign(new DomainSequence(introOptions()), {
        seconds: fixedTime,
      }).state();
  if (!state.fromGo) {
    drawRoundResults(
      roundSnapshotContext,
      resultFixture() as unknown as import('../../src/simulation.ts').Simulation,
      {
        picture,
        arena,
        round: Math.max(1, round - 1),
        rows: 3,
      },
    );
  }
  drawDomainIntro(g, state, {
    picture,
    arena,
    round,
    snapshot: state.fromGo ? snapshot : roundSnapshot,
  });
  $('#state').textContent =
    `${state.fromGo ? 'GO! — зелёная полоса' : 'Между раундами — без зелёной полосы'}; фаза: ${state.phase}; время: ${state.seconds.toFixed(2)}; участки: ${state.unlocks.map((n) => Math.round(n * 100) + '%').join(', ')}`;
}
requestAnimationFrame(frame);
