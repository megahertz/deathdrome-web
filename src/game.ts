import { AudioDirector } from './audio-director.ts';
import {
  backAction,
  installBackGuard,
  installMenuTaps,
  installEdgeBack,
  deduplicateBack,
  installTopTap,
  nextMenuButton,
} from './back-navigation.ts';
import type { BitmapLabel } from './bitmap-ui.ts';
import {
  bitmapLabel,
  bitmapWidth,
  bitmapFontsReady,
  imageReady,
} from './bitmap-ui.ts';
import { CreditsSequence } from './credits.ts';
import { drawDomainIntro } from './domain-presentation.ts';
import { Effects } from './effects.ts';
import { beginEntrance } from './entrance.ts';
import { errorMessage } from './errors.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Vec3 } from './game-types.ts';
import { stepHudWarning, playerIsLocked } from './hud-warning.ts';
import { drawHud, RUNNER_SHADES, runnerName } from './hud.ts';
import { readControls, KeyPressLatch } from './input.ts';
import { createKeepMovingState } from './keep-moving.ts';
import {
  MENU_SOUNDS,
  animateMenuEntry,
  animateMenuBack,
} from './menu-presentation.ts';
import { PaletteBrightness } from './palette-brightness.ts';
import { PaletteFlash } from './palette-flash.ts';
import {
  DomainSequence,
  ResultSequence,
  pickupYaw,
} from './presentation-sequences.ts';
import {
  View,
  THREE,
  modelData,
  makeModel,
  poseRunnerModel,
  makeRunnerModel,
  texturesReady,
} from './renderer.ts';
import { resourceURL } from './resource-urls.ts';
import { ResponsiveHud, restoreOriginalHud } from './responsive-hud.ts';
import {
  drawRoundResults,
  resultContinuation,
  resultAdvance,
} from './round-results.ts';
import { makeRunnerPreview, stepRunnerPreview } from './runner-preview.ts';
import { Simulation, RUNNERS } from './simulation.ts';
import { TouchControls, touchWeaponAvailable } from './touch-controls.ts';
import { TypewriterSequence } from './typewriter.ts';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw Error('Missing interface element: ' + selector);
    }
    return element;
  },
  menu = $('#menu'),
  canvas = $<HTMLCanvasElement>('#world'),
  ctx = $<HTMLCanvasElement>('#overlay').getContext('2d')!,
  notice = $('#notice');
const responsiveHud = new ResponsiveHud();
let menuCue = MENU_SOUNDS.enter,
  mainMenuShown = false;
let menuBack: (() => void) | null = null,
  menuActions: Partial<
    Record<'left' | 'right' | 'enter', () => unknown>
  > | null = null,
  resultsContinue: ((event?: { repeat?: boolean }) => unknown) | null = null,
  resultSequence: ResultSequence | null = null,
  intro: DomainSequence | null = null,
  introReady = false,
  introSnapshot: HTMLCanvasElement | null = null,
  exitAnnounced = false;
const transition = document.createElement('canvas');
transition.id = 'transition';
transition.width = 320;
transition.height = 200;
transition.hidden = true;
$('#stage').append(transition);
const transitionCtx = transition.getContext('2d')!;
transitionCtx.imageSmoothingEnabled = false;
let gameMessages: import('./hud-types.ts').HudMessage[] = [],
  resultWin = false,
  warningState: import('./hud-types.ts').WarningState = {
    active: false,
    timer: 0,
  };
ctx.setTransform(2, 0, 0, 2, 0, 0);
ctx.imageSmoothingEnabled = false;
let trainingPage = 0,
  trainingWriter: TypewriterSequence | null = null,
  trainingBlocks: BitmapLabel[] = [];
let touchUI: TouchControls;
const weaponSelection = new KeyPressLatch('ShiftLeft', 'ShiftRight');
let creditsWriter: CreditsSequence | null = null,
  creditsBlocks: HTMLElement[] = [];
let view: View;
let sim: Simulation | null;
let visuals: Effects;
let mode = 'menu';
let arena = 1;
let round = 1;
let runner = 0;
let runnerMeshes: THREE.Group<THREE.Object3DEventMap>[] = [];
let pickupMeshes: THREE.Group<THREE.Object3DEventMap>[] = [];
let rechargeMeshes: THREE.Group<THREE.Object3DEventMap>[] = [];

let preview: THREE.Group<THREE.Object3DEventMap> | null = null;
const keys = new Set<string>();
let tick = 0;
let prev = 0;
let accumulator = 0;
let msgUntil = 0;
let busy = false;
const [paths, rechargePaths, trainingData, creditsData] = await Promise.all(
  ['ai-paths', 'recharge-paths', 'training', 'credits'].map((name) =>
    fetch(resourceURL(`assets/${name}.json`)).then((r) => r.json()),
  ),
);
let saved: {
  arena?: number;
  round?: number;
  runner?: number;
  scores?: { name: string; score: number; kills: number }[];
} = {};
try {
  saved = JSON.parse(localStorage.getItem('deathdrome-progress') || '{}');
} catch {
  // Keep in-memory defaults if browser storage is unavailable or malformed.
}
const images = new Map();
function picture(path: string) {
  if (!images.has(path)) {
    const i = new Image();
    i.src = resourceURL('assets/' + path + '.png');
    images.set(path, i);
  }
  return images.get(path);
}

let graphicsModeButton: HTMLButtonElement | null = null;
let storedOptions: unknown = {};
try {
  storedOptions = JSON.parse(
    localStorage.getItem('deathdrome-options') || '{}',
  );
} catch {
  // Keep in-memory defaults if browser storage is unavailable or malformed.
}
const availableArenas = window.deathdromeInstallation?.arenas || [
  1, 2, 3, 4, 5, 6, 7, 8,
];
const paletteBrightness = new PaletteBrightness($('#stage')),
  paletteFlash = new PaletteFlash(),
  keepMovingState = createKeepMovingState();
const audio = new AudioDirector({
  options: storedOptions,
  musicTracks: window.deathdromeInstallation?.musicTracks ?? null,
  musicExtension: window.deathdromeInstallation?.musicExtension ?? 'ogg',
  onChange: (event) => {
    if (event.music) {
      $('#stage').dataset.musicSource = event.music.source;
      $('#stage').dataset.musicReady = String(event.music.ready);
      if (event.music.ready) {
        $('#stage').dataset.musicDuration = String(event.music.duration);
      }
    }
    if (event.options) {
      try {
        localStorage.setItem(
          'deathdrome-options',
          JSON.stringify(event.options),
        );
      } catch {
        // Keep in-memory defaults if browser storage is unavailable or malformed.
      }
      $('#stage').dataset.musicEnabled = String(event.options.musicEnabled);
      $('#stage').dataset.musicTrack = String(event.track);
      $('#stage').dataset.musicSuspended = String(event.suspended);
      if (event.options.musicEnabled) {
        if (event.suspended) {
          $('#music').textContent = 'Music paused';
        } else {
          $('#music').textContent = 'Music on';
        }
      } else {
        $('#music').textContent = 'Music off';
      }
      $('#music').setAttribute(
        'aria-pressed',
        String(event.options.musicEnabled),
      );
      paletteBrightness.setLevel(event.options.brightness);
      view?.setEnhancedGraphics(event.options.enhancedGraphics);
      updateViewportMode();
      updateGraphicsMode();
      $('#sound').textContent = event.muted ? 'Sound off' : 'Sound on';
      $('#sound').setAttribute('aria-pressed', String(!event.muted));
    }
    if (event.sound) {
      $('#stage').dataset.lastSound = event.sound;
    }
  },
});
function sound(name: string, volume = 0.6) {
  return audio.sound(name, volume);
}
function playMusic(track = 3) {
  audio.playMusic(track);
}
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
window.addEventListener('keydown', () => audio.unlock(), { capture: true });
function message(s: string, color = 'whit', tag: string | null = null) {
  notice.textContent = s;
  msgUntil = performance.now() + 4000;
  gameMessages.push({ text: s.toUpperCase(), color, tag, until: msgUntil });
  gameMessages = gameMessages.slice(-3);
  gameMessages.forEach(
    (m, i) => (m.y = 60 - (gameMessages.length - 1 - i) * 11),
  );
}
function save() {
  try {
    localStorage.setItem('deathdrome-progress', JSON.stringify(saved));
  } catch {
    // Browsers can reject fullscreen requests after an interrupted gesture.
  }
}
function clearInput() {
  if (touchUI) {
    touchUI.reset({ keyboard: true });
  } else {
    keys.clear();
  }
  weaponSelection.reset();
}
function updateViewportMode() {
  const active =
    !!view?.enhancedGraphics && ['playing', 'paused'].includes(mode);
  $('#stage').classList.toggle('enhanced-viewport', active);
  if (view) {
    view.responsiveViewport = active;
    if (!active) {
      view.hudLayout = null;
    }
  }
  if (!active) {
    restoreOriginalHud(ctx);
  }
}
function setMode(next: string) {
  if (mode !== next) {
    clearInput();
  }
  mode = next;
  const mobilePaused = next === 'paused' && !!touchUI?.media.matches;
  menu.classList.toggle('mobile-pause', mobilePaused);
  $('#stage').classList.toggle('mobile-paused', mobilePaused);
  touchUI?.setMode(next);
  updateViewportMode();
}
function quitGame() {
  clearInput();
  menu.removeAttribute('aria-label');
  menuCue = MENU_SOUNDS.back;
  if (touchUI?.media.matches) {
    mainMenu();
  } else {
    gameOptions();
  }
  menuCue = MENU_SOUNDS.enter;
}
const navigateBack = deduplicateBack(() => {
  const action = backAction(mode, !!menuBack);
  if (action === 'pause') {
    pause();
  } else if (action === 'quit') {
    quitGame();
  } else if (action === 'menu') {
    clearInput();
    menuCue = MENU_SOUNDS.back;
    menuBack?.();
    menuCue = MENU_SOUNDS.enter;
  }
});
function base(title: string, background = 'dombak1', animate = true) {
  graphicsModeButton = null;
  if (animate && menuCue === MENU_SOUNDS.back) {
    animateMenuBack($('#stage'), menu, captureMenu());
  } else {
    animateMenuEntry($('#stage'), menu, animate);
  }
  if (animate) {
    sound(menuCue, 0.6);
  }
  if (title) {
    playMusic(11);
  }
  resultsContinue = null;
  gameMessages = [];
  warningState = { active: false, timer: 0 };
  menu.removeAttribute('data-scroll-pixels');
  menu.removeAttribute('aria-label');
  trainingWriter = null;
  menuActions = null;
  menuBack = mainMenu;
  setMode('menu');
  view.clear();
  view.hud = false;
  view.preview = false;
  preview = null;
  menu.replaceChildren();
  notice.textContent = '';
  ctx.clearRect(0, 0, 320, 200);
  const bg = document.createElement('img');
  bg.src = resourceURL(`assets/images/${background}.png`);
  bg.className = 'background';
  menu.append(bg);
  const titles: Record<string, string> = {
    'DEATHDROME': 'domtitle',
    'GAME TYPE': 'gt_title',
    'GAME OPTIONS': 'go_title',
    'SELECT RUNNER': 'rn_title',
    'SELECT DOMAIN': 'al_title',
    'HIGH SCORES': 'hs_title',
    'OPTIONS': 'op_title',
    'CONTROLS': 'cf_title',
    'CREDITS': 'c_title',
    'MULTI START': 'ms_title',
  };
  if (titles[title]) {
    const h = document.createElement('img');
    h.src = resourceURL('assets/images/' + titles[title] + '.png');
    h.className = 'title-art';
    menu.append(h);
  } else {
    const h = document.createElement('div');
    h.className = 'heading';
    h.replaceChildren(bitmapLabel(title, { color: 'red' }));
    menu.append(h);
  }
}
function button(label: string, y: number, fn: () => unknown, x = 15, w = 70) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = `top:${y}%;left:${x}%;width:${w}%;height:9%`;
  b.onclick = () => {
    if (/^back$/i.test(label)) {
      menuCue = MENU_SOUNDS.back;
      fn();
      menuCue = MENU_SOUNDS.enter;
    } else {
      fn();
    }
  };
  menu.append(b);
  return b;
}
function body(html: string) {
  const el = document.createElement('div');
  el.className = 'body';
  el.innerHTML = html;
  menu.append(el);
  return el;
}
function nativeButton(
  label: string,
  x: number,
  y: number,
  fn: () => unknown,
  w = 210,
) {
  const b = button(label, y / 2, fn, x / 3.2, w / 3.2) as HTMLButtonElement & {
    firstChild: BitmapLabel;
  };
  b.className = 'native-button';
  b.style.height = '5%';
  b.setAttribute('aria-label', label);
  b.replaceChildren(bitmapLabel(label));
  b.onfocus = () => (b.firstChild as BitmapLabel).setColor('yelo');
  b.onpointerenter = (e) => {
    if (e.pointerType === 'mouse' && document.activeElement !== b) {
      sound(MENU_SOUNDS.move, 0.5);
      b.focus({ preventScroll: true });
    }
  };
  b.onblur = () => (b.firstChild as BitmapLabel).setColor('grey');
  return b;
}
function clickableBackHint(image: string | Node) {
  const b = document.createElement('button');
  b.className = 'key-hint-button';
  b.setAttribute('aria-label', 'Back');
  b.onclick = () => navigateBack('hint');
  b.append(image);
  menu.append(b);
  return b;
}
function hints(back = true) {
  const entries: [string, number][] = back
    ? [
        ['esc', 1],
        ['enter', 255],
      ]
    : [['enter', 255]];
  for (const [name, x] of entries) {
    const i = document.createElement('img');
    i.src = resourceURL('assets/images/' + name + '.png');
    i.className = 'key-hint';
    i.style.left = x / 3.2 + '%';
    if (name === 'esc') {
      clickableBackHint(i);
    } else {
      menu.append(i);
    }
  }
}
function mainMenu() {
  sim = null;
  const animate = mainMenuShown;
  mainMenuShown = true;
  base('DEATHDROME', 'dombak1', animate);
  menuBack = null;
  const actions = [
    ['START GAME...', newGame],
    ['OPTIONS...', options],
    ['CONTROLS...', controls],
    ['TRAINING GUIDE...', training],
    ['HIGH SCORES...', highScores],
    ['CREDITS...', credits],
    ['FULLSCREEN', toggleFullscreen],
  ] as const;
  actions.forEach(([label, fn], i) => nativeButton(label, 94, 70 + i * 17, fn));
  hints(false);
  menu.querySelector<HTMLButtonElement>('button')!.focus();
  picture('hud/small/hud_top');
  picture('hud/small/hud_bot');
  picture('hud/small/hud_rdr');
  picture('hud/small/reticle');
}
function newGame() {
  round = 1;
  gameOptions();
}
function art(name: string, x: number, y: number, w: number, h: number) {
  const i = document.createElement('img');
  i.src = resourceURL('assets/images/' + name + '.png');
  i.style.cssText = `position:absolute;left:${x / 3.2}%;top:${y / 2}%;width:${w / 3.2}%;height:${h / 2}%;image-rendering:pixelated`;
  menu.append(i);
  return i;
}
function bitmapAt(
  label: string,
  x: number,
  y: number,
  { color = 'grey', size = 10 } = {},
) {
  const c = bitmapLabel(label, { color, size });
  c.style.cssText = `position:absolute;left:${x / 3.2}%;top:${y / 2}%;width:${c.width / 3.2}%;height:${size / 2}%`;
  menu.append(c);
}
function gameOptions() {
  picture('images/st_down');
  for (let q = 0; q <= 4; q++) {
    picture('images/sp_a' + arena + (q ? 'q' + q : ''));
  }
  picture('images/dd');
  base('GAME OPTIONS', 'dombak2');
  menuBack = mainMenu;
  art('st_up', 56, 59, 69, 19).classList.add('go-art');
  nativeButton('GO!', 75, 61, () => startGame(), 45).classList.add('go-button');
  nativeButton('SELECT RUNNER...', 145, 116, chooseRunner, 174);
  nativeButton('SELECT DOMAIN...', 145, 170, chooseArena, 174);
  bitmapAt(GAME_TABLES.runners[runner].name, 145, 97, {
    color: ['red', 'blue', 'yelo', 'whit', 'purp', 'gren', 'pink', 'orng'][
      runner
    ],
    size: 7,
  });
  bitmapAt(GAME_TABLES.domains[arena - 1].name, 145, 147, {
    color: 'gren',
    size: 7,
  });
  art(
    [
      'redrun',
      'blurun',
      'ylwrun',
      'whtrun',
      'prprun',
      'grnrun',
      'pnkrun',
      'orgrun',
    ][runner],
    46,
    92,
    70,
    40,
  );
  art('ar' + arena + 'logo', 46, 142, 70, 50);
  hints();
  menu.querySelector<HTMLButtonElement>('button')!.focus();
}
function controls() {
  base('CONTROLS');
  const rows = [
    ['FORWARD / REVERSE', 'UP / DOWN OR W / S'],
    ['TURN LEFT / RIGHT', 'LEFT / RIGHT OR A / D'],
    ['LOOK LEFT / RIGHT', 'E / R'],
    ['REAR VIEW', 'Q'],
    ['FIRE', 'ALT'],
    ['SELECT WEAPON', 'SHIFT'],
    ['JUMP / BARRIER', 'SPACE / CTRL'],
    ['MUSIC ON / OFF', 'M'],
    ['TAUNT / PAUSE', 'T / ESC'],
  ];
  for (const [i, [action, key]] of rows.entries()) {
    bitmapAt(action, 15, 54 + i * 13, { size: 7, color: 'whit' });
    bitmapAt(key, 164, 54 + i * 13, { size: 7, color: 'yelo' });
  }
  hints();
  menuBack = mainMenu;
  menu.setAttribute(
    'aria-label',
    'Controls: WASD or arrows to drive; Alt fires, Shift selects weapon; Space jumps, Ctrl barrier; Q rear view; M music; Escape pause.',
  );
  canvas.focus({ preventScroll: true });
}
function chooseArena() {
  base('SELECT DOMAIN', 'dombak1');
  menuBack = gameOptions;
  sound('sel_dom', 0.5);
  for (let i = 1; i <= 8; i++) {
    const col = (i - 1) % 4,
      row = Math.floor((i - 1) / 4),
      x = 22 + col * 70;
    art('ar' + i + 'logo', x + 12, 54 + row * 50, 40, 30);
    const label = GAME_TABLES.domains[i - 1].name,
      b = nativeButton(
        label,
        x,
        85 + row * 50,
        () => {
          arena = i;
          gameOptions();
        },
        66,
      );
    b.style.height = '3.5%';
    b.replaceChildren(bitmapLabel(label, { size: 7 }));
    (b.firstChild as HTMLElement).style.maxWidth = '100%';
    if (!availableArenas.includes(i)) {
      b.disabled = true;
      b.setAttribute('aria-label', label + ' — not included in this image');
      b.style.opacity = '.35';
    }
  }
  nativeButton('BACK', 140, 174, gameOptions, 55);
  hints();
  menu.querySelectorAll<HTMLButtonElement>('button')[arena - 1].focus();
}
async function chooseRunner(changing = false) {
  base('SELECT RUNNER', 'dombak3', !changing);
  menuBack = gameOptions;
  menuActions = {
    left: () => changeRunner(-1),
    right: () => changeRunner(1),
    enter: gameOptions,
  };
  const shade = ['red', 'blue', 'yelo', 'whit', 'purp', 'gren', 'pink', 'orng'][
      runner
    ],
    { name } = GAME_TABLES.runners[runner];
  bitmapAt(name, 160 - bitmapWidth(name, 10) / 2, 117, {
    color: shade,
    size: 10,
  });
  for (const [j, label] of [
    'SPEED',
    'HANDLING',
    'ARMOUR',
    'WEAPONS',
  ].entries()) {
    bitmapAt(label, 82, 139 + j * 15, { size: 7, color: 'whit' });
    bitmapAt(GAME_TABLES.runners[runner].ratings[j], 166, 139 + j * 15, {
      size: 7,
      color: shade,
    });
  }
  for (const [direction, x, delta, image] of [
    ['Previous runner', 23, -1, 'arrow_l'],
    ['Next runner', 270, 1, 'arrow_r'],
  ] as const) {
    const b = button('', 32.5, () => changeRunner(delta), x / 3.2, 26 / 3.2);
    b.setAttribute('aria-label', direction);
    b.style.height = '12.5%';
    const i = document.createElement('img');
    i.src = resourceURL(`assets/images/${image}.png`);
    i.style.cssText = 'width:100%;height:100%;image-rendering:pixelated';
    b.append(i);
  }
  hints();
  menu.setAttribute(
    'aria-label',
    `Select runner: ${name}. Left and right change runner; Enter selects.`,
  );
  canvas.focus({ preventScroll: true });
  if (!changing) {
    sound('sel_run', 0.5);
  }
  const token = runner;
  const data = await modelData(RUNNERS[runner]);
  if (mode !== 'menu' || runner !== token || !menuActions?.left) {
    return;
  }
  // MENU.GW includes the textured floor under the runner inside this viewport.
  preview = makeRunnerPreview(data);
  view.preview = true;
  view.scene.background = new THREE.Color(0x000000);
  view.objects.add(preview);
  view.camera.position.set(0, 2.3, 10);
  view.camera.rotation.set((-10 * Math.PI) / 180, 0, 0);
}
function changeRunner(delta: number) {
  sound(MENU_SOUNDS.move, 0.5);
  runner = (runner + delta + 8) % 8;
  chooseRunner(true);
}
function training(page = 0) {
  trainingPage = Math.max(0, Math.min(4, page));
  const data = trainingData.pages[trainingPage];
  base('', data.background);
  setMode('training');
  menuBack = mainMenu;
  menu.setAttribute(
    'aria-label',
    `Training guide, page ${trainingPage + 1} of 5. Use left and right arrows; Escape returns.`,
  );
  trainingWriter = new TypewriterSequence(data.paragraphs);
  trainingBlocks = data.paragraphs.map(
    (p: { color: any; text: string; x: number; y: number }) => {
      const c = bitmapLabel('', { size: 7, color: p.color });
      c.removeAttribute('aria-hidden');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', p.text);
      c.style.cssText = `position:absolute;left:${p.x / 3.2}%;top:${p.y / 2}%;image-rendering:pixelated`;
      menu.append(c);
      return c;
    },
  );
  for (const icon of data.icons) {
    art(icon.name, icon.x, icon.y, 32, 32);
  }
  art('frame', 0, 0, 320, 200);
  for (let i = 0; i <= trainingPage; i++) {
    art('framebut', 121 + i * 29, 6, 20, 9);
  }
  clickableBackHint(art('esc', 1, 192, 64, 8));
  for (const [direction, x, name, delta] of [
    ['left', 50, 'arrol', -1],
    ['right', 270, 'arror', 1],
  ] as const) {
    if (trainingPage + delta >= 0 && trainingPage + delta < 5) {
      const b = button(
        '',
        4,
        () => training(trainingPage + delta),
        x / 3.2,
        9 / 3.2,
      );
      b.style.cssText +=
        ';height:2.5%;display:flex;align-items:center;line-height:0;font-size:0';
      b.classList.add('training-arrow');
      b.dataset.direction = direction;
      b.setAttribute(
        'aria-label',
        direction === 'left' ? 'Previous training page' : 'Next training page',
      );
      const image = document.createElement('img');
      image.src = resourceURL('assets/images/' + name + '.png');
      image.style.cssText = 'width:100%;height:100%;image-rendering:pixelated';
      b.append(image);
    }
  }
}
function updateTraining(dt: number) {
  if (!trainingWriter?.step(dt)) {
    return;
  }
  trainingData.pages[trainingPage].paragraphs.forEach(
    (p: { text: string }, i: number) => {
      const c = trainingBlocks[i];
      c.setText(p.text.slice(0, trainingWriter!.visible[i]));
      c.style.width = c.width / 3.2 + '%';
      c.style.height = c.height / 2 + '%';
    },
  );
}
function highScores() {
  base('HIGH SCORES', 'dombak4');
  const list = saved.scores || [];
  if (list.length) {
    for (const [label, x] of [
      ['RANK', 15],
      ['NAME', 52],
      ['SCORE', 174],
      ['KILLS', 267],
    ] as const) {
      bitmapAt(label, x, 45, { size: 7, color: 'yelo' });
    }
    for (const [i, score] of list.slice(0, 10).entries()) {
      const y = 60 + i * 11;
      bitmapAt(String(i + 1), 15, y, { size: 7, color: 'whit' });
      bitmapAt(String(score.name).slice(0, 16), 52, y, {
        size: 7,
        color: 'whit',
      });
      bitmapAt(String(score.score), 174, y, { size: 7, color: 'whit' });
      bitmapAt(String(score.kills), 267, y, { size: 7, color: 'whit' });
    }
  } else {
    bitmapAt('NO ENTRIES', 125, 95, { size: 7 });
  }
  hints();
  menuBack = mainMenu;
  menu.setAttribute(
    'aria-label',
    'High scores. ' +
      (list.length
        ? list
            .slice(0, 10)
            .map(
              (s: { name: any; score: any; kills: any }, i: number) =>
                `${i + 1}. ${s.name}, score ${s.score}, ${s.kills} kills`,
            )
            .join('; ')
        : 'No entries.'),
  );
  canvas.focus({ preventScroll: true });
}
function credits() {
  base('', creditsData.background);
  setMode('credits');
  creditsWriter = new CreditsSequence(creditsData);
  menu.setAttribute(
    'aria-label',
    'Credits. Original scrolling sequence. Escape returns.',
  );
  menu.setAttribute('data-scroll-pixels', '0');
  creditsBlocks = creditsData.rows.map(
    (row: { text: string; size: number; color: any; x: number; y: number }) => {
      if (!row.text) {
        return null;
      }
      const c = bitmapLabel(row.text, { size: row.size, color: row.color });
      c.removeAttribute('aria-hidden');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', row.text);
      c.style.cssText = `position:absolute;left:${row.x / 3.2}%;top:${row.y / 2}%;width:${c.width / 3.2}%;height:${row.size / 2}%;image-rendering:pixelated`;
      menu.append(c);
      return c;
    },
  );
  clickableBackHint(art('esc', 1, 192, 64, 8));
}
function updateCredits(dt: number) {
  if (!creditsWriter?.step(dt)) {
    return;
  }
  menu.setAttribute('data-scroll-pixels', String(creditsWriter.pixels));
  creditsData.rows.forEach((row: { y: number }, i: number) => {
    const c = creditsBlocks[i];
    if (c) {
      c.style.top = (row.y - creditsWriter!.pixels) / 2 + '%';
    }
  });
  if (creditsWriter.finished) {
    mainMenu();
  }
}
function options() {
  for (const name of ['slidebh', 'slidebl', 'knobh', 'knobl']) {
    picture('images/' + name);
  }
  base('OPTIONS');
  menuBack = mainMenu;
  menuActions = { left: () => adjustOption(-1), right: () => adjustOption(1) };
  const fields = [
    ['GRAPHIC DETAILS', 'detail'],
    ['GRAPHIC MODE', 'enhancedGraphics'],
    ['BRIGHTNESS', 'brightness'],
    ['MUSIC VOLUME', 'musicVolume'],
    ['SFX VOLUME', 'sfxVolume'],
  ] as const;
  for (const [i, [label, key]] of fields.entries()) {
    const y = 65 + i * 25;
    if (key === 'enhancedGraphics') {
      const b = nativeButton(label, 20, y, toggleGraphicsMode, 280);
      graphicsModeButton = b;
      b.id = 'graphic-mode';
      b.dataset.option = key;
      const value = bitmapLabel('ORIGINAL');
      value.classList.add('graphic-mode-value');
      b.append(value);
      const focus = b.onfocus,
        blur = b.onblur;
      b.onfocus = () => {
        focus?.call(b, new FocusEvent('focus'));
        value.setColor('yelo');
      };
      b.onblur = () => {
        blur?.call(b, new FocusEvent('blur'));
        value.setColor('grey');
      };
      b.onkeydown = (event) => {
        if (event.code === 'Space') {
          event.preventDefault();
          if (!event.repeat) {
            b.click();
          }
        }
      };
      continue;
    }
    const b = nativeButton(label, 20, y, () => adjustOption(1, key), 170);
    b.dataset.option = key;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '9';
    slider.step = '1';
    slider.value = String(audio.options[key]);
    slider.dataset.option = key;
    slider.setAttribute('aria-label', label);
    slider.className = 'native-slider';
    slider.style.cssText = `left:59.375%;top:${(y - 8) / 2}%;width:35%;height:10%`;
    slider.onfocus = () => (b.firstChild as BitmapLabel).setColor('yelo');
    slider.onblur = () => (b.firstChild as BitmapLabel).setColor('grey');
    slider.oninput = () => {
      audio.setOption(key, Number(slider.value));
      sound('chc_minl', 0.6);
      updateOptionSliders();
    };
    menu.append(slider);
  }
  updateGraphicsMode();
  hints();
  updateOptionSliders();
  menu.querySelector<HTMLButtonElement>('button')!.focus();
}
function toggleGraphicsMode() {
  audio.setOption('enhancedGraphics', !audio.options.enhancedGraphics);
  sound('wea_clik', 0.6);
}
function updateGraphicsMode() {
  if (!graphicsModeButton) {
    return;
  }
  const enhanced = audio.options.enhancedGraphics,
    value = enhanced ? 'ENHANCED' : 'ORIGINAL';
  graphicsModeButton.setAttribute('aria-label', 'GRAPHIC MODE: ' + value);
  const label = graphicsModeButton.querySelector<BitmapLabel>(
    '.graphic-mode-value',
  )!;
  label.setText(value);
  label.setColor(
    document.activeElement === graphicsModeButton ? 'yelo' : 'grey',
  );
}
function updateOptionSliders() {
  for (const s of menu.querySelectorAll<HTMLInputElement>('.native-slider')) {
    s.value = String(
      audio.options[
        s.dataset.option as import('./audio-types.ts').NumericOption
      ],
    );
    s.style.setProperty('--level', (Number(s.value) / 9) * 100 + '%');
    s.setAttribute('aria-valuetext', s.value + ' of 9');
  }
  view.detail = audio.options.detail;
}
function adjustOption(
  delta: number,
  key: string | undefined = (document.activeElement as HTMLElement | null)
    ?.dataset.option,
) {
  if (!key) {
    return;
  }
  if (key === 'enhancedGraphics') {
    toggleGraphicsMode();
    return;
  }
  const value = Math.max(
    0,
    Math.min(
      9,
      audio.options[key as import('./audio-types.ts').NumericOption] + delta,
    ),
  );
  if (
    value === audio.options[key as import('./audio-types.ts').NumericOption]
  ) {
    return;
  }
  audio.setOption(key as keyof typeof audio.options, value);
  updateOptionSliders();
  sound('chc_minl', 0.6);
}
function captureMenu() {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  const g = c.getContext('2d')!,
    bounds = menu.getBoundingClientRect();
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, 320, 200);
  if (['results', 'playing', 'paused'].includes(mode)) {
    g.drawImage($('#overlay'), 0, 0, 320, 200);
  }
  for (const item of menu.querySelectorAll<
    HTMLCanvasElement | HTMLImageElement
  >('img,canvas')) {
    if (item instanceof HTMLImageElement && !item.naturalWidth) {
      continue;
    }
    const r = item.getBoundingClientRect();
    g.drawImage(
      item.classList.contains('go-art') &&
        menu.querySelector<HTMLButtonElement>('.go-button.pressed')!
        ? picture('images/st_down')
        : item,
      ((r.left - bounds.left) / bounds.width) * 320,
      ((r.top - bounds.top) / bounds.height) * 200,
      (r.width / bounds.width) * 320,
      (r.height / bounds.height) * 200,
    );
  }
  for (const slider of menu.querySelectorAll<HTMLInputElement>(
    '.native-slider',
  )) {
    const r = slider.getBoundingClientRect(),
      x = ((r.left - bounds.left) / bounds.width) * 320,
      y = ((r.top - bounds.top) / bounds.height) * 200,
      active =
        (document.activeElement as HTMLElement | null)?.dataset.option ===
        slider.dataset.option,
      track = picture('images/slideb' + (active ? 'h' : 'l')),
      knob = picture('images/knob' + (active ? 'h' : 'l'));
    if (track.complete && track.naturalWidth) {
      g.drawImage(track, x, y, 112, 20);
    }
    if (knob.complete && knob.naturalWidth) {
      g.drawImage(knob, x + (Number(slider.value) / 9) * 102, y + 8, 10, 10);
    }
  }
  return c;
}
function introCue(name: string) {
  if (name === 'split') {
    sound('compclse', 0.6);
  }
  if (name === 'map') {
    sound('compopen', 0.6);
  }
  if (name === 'unlock1' || name === 'unlock2') {
    sound('wea_clik', 0.6);
  }
  if (name === 'clearing') {
    sound(round === 1 ? 'crimprep' : 'prepnext');
  }
  if (name === 'fade') {
    sound('compclse', 0.6);
  }
  if (name === 'scene') {
    enterRound();
  }
}
function drawIntro() {
  if (!intro) {
    return;
  }
  const state = intro.state();
  transition.hidden = false;
  transition.dataset.phase = state.phase;
  drawDomainIntro(transitionCtx, state, {
    picture,
    arena,
    round,
    snapshot: introSnapshot,
  });
  if (state.finished) {
    intro = null;
    transition.hidden = true;
  }
}
async function startGame(continuing = false) {
  if (busy) {
    return;
  }
  sound(MENU_SOUNDS.enter, 0.6);
  busy = true;
  menu.querySelector<HTMLElement>('.go-button')?.classList.add('pressed');
  introSnapshot = captureMenu();
  base('', 'dombak4', false);
  setMode('loading');
  menu.replaceChildren();
  introReady = false;
  exitAnnounced = false;
  audio.doorSounds.clear();
  intro = new DomainSequence({ round, fromGo: !continuing, onCue: introCue });
  try {
    view.hud = true;
    const data = await view.arena(arena);
    view.configurePortals(round);

    visuals = await Effects.create(view);
    const models = await Promise.all(RUNNERS.map(modelData));
    const old = continuing ? sim : null;
    sim = new Simulation({
      arena,
      round,
      player: runner,
      keepMovingState,
      paths: paths[arena - 1],
      rechargePaths: rechargePaths[arena - 1],
      markers: data.markers,
      ground: (
        x: number,
        z: number,
        y: number = 200,
        support: boolean = false,
      ) => view.ground(x, z, y, support),
      blocked: (a: any, b: any) => view.blocked(a, b),
      lineBlocked: (a: any, b: any) => view.lineBlocked(a, b),
      sceneContacts: (
        a: any,
        b: any,
        r?: Partial<import('./game-types.ts').Runner>,
      ) =>
        view.lineContacts(a, b, {
          runners: sim?.runners ?? [],
          models: runnerMeshes,
          ignore: r?.id,
        }),
      wallContact: (a: Vec3, b: Vec3) => view.sweep(a, b),
      sceneSweep: (a: any, b: any) => view.sweepContacts(a, b),
      updateDoor: (key: string, height: number) => {
        doorSound('key-' + key, view.doors[key]?.position.y || 0, height);
        view.setDoorHeight(key, height);
      },
      updatePortal: (id: string, height: number) => {
        doorSound(
          'portal-' + id,
          view.portals[id]?.open?.position.y || 0,
          height,
        );
        view.setPortalHeight(id, height);
      },
      updateHotSpot: (s: { id: number; phase: number }) =>
        view.setHotSpotState(s),
      updateExitHangar: (h: { door: number; sign: number }) =>
        view.setExitHangar(h),
      captureCamera: () => view.captureCamera(),
      updateEntrance: (e: any) => view.setEntrance(e),
    });
    view.onDoorTouch = (key, r) => sim?.doors.touch(key, r);
    view.onPortalTouch = (id: any, r: any) =>
      sim?.portals.touch(id, r, sim.stepSeconds || 1 / 60);
    if (old) {
      sim.score = old.score;
      sim.lives = old.lives;
      sim.lifeThreshold = old.lifeThreshold;
    }
    runnerMeshes = models.map((d) => {
      const o = makeRunnerModel(d);
      view.objects.add(o);
      return o;
    });
    pickupMeshes = [];
    const pickupModels = await Promise.all(
      sim.pickups.map((pick) => modelData(pick.type.replace('.gam', ''))),
    );
    for (const [i, pick] of sim.pickups.entries()) {
      const d = pickupModels[i];
      const mesh = makeModel(d);
      mesh.position.set(pick.x, pick.y, pick.z);
      view.objects.add(mesh);
      pickupMeshes.push(mesh);
    }
    rechargeMeshes = [];
    const rechargeModel = await modelData('keytest');
    for (const _orb of sim.recharge.orbs) {
      const mesh = makeModel(rechargeModel);
      view.objects.add(mesh);
      rechargeMeshes.push(mesh);
    }
    await texturesReady();
    view.enablePlayerSpotlight(models[runner]);
    menu.replaceChildren();
    setMode('loading');
    introReady = true;
    saved.arena = arena;
    saved.round = round;
    saved.runner = runner;
    save();
    view.camera.position.set(0, 18, -35);
    canvas.focus({ preventScroll: true });
    busy = false;
  } catch (e) {
    busy = false;
    intro = null;
    transition.hidden = true;
    base('UNABLE TO LOAD');
    body('').textContent = 'The domain could not load. ' + errorMessage(e);
    button('Return', 85, mainMenu);
    console.error(e);
  }
}
function enterRound() {
  const activeSim = sim;
  if (!activeSim) {
    return;
  }

  if (!activeSim?.entrance) {
    beginEntrance(activeSim);
  }
  menu.replaceChildren();
  menu.removeAttribute('aria-label');
  view.hud = true;
  setMode('playing');
  playMusic(3 + ((arena - 1) % 8));
  sound('round' + round);
  canvas.focus({ preventScroll: true });
  clearInput();
  accumulator = 0;
}
function pause() {
  if (mode !== 'playing') {
    return;
  }
  setMode('paused');
  menu.replaceChildren();
  view.hud = true;
  if (touchUI.media.matches) {
    for (const [label, y, action] of [
      ['MAIN MENU', 55, quitGame],
      ['FULLSCREEN', 90, toggleFullscreen],
      ['RESUME', 125, resume],
    ] as const) {
      const b = nativeButton(label, 80, y, action, 160);
      b.classList.add('mobile-pause-choice');
      (b.firstChild as BitmapLabel).setColor('gren');
    }
    menu.setAttribute('aria-label', 'Paused. Main menu, Fullscreen, Resume.');
    return;
  }
  const prompt = bitmapLabel('DO YOU WANT TO QUIT? <Y/N>', {
    color: 'yelo',
    size: 10,
  });
  prompt.style.cssText = `position:absolute;left:${(160 - Math.floor((25 * 10) / 2)) / 3.2}%;top:35%;width:${prompt.width / 3.2}%;height:5%`;
  menu.append(prompt);
  menu.setAttribute(
    'aria-label',
    'Do you want to quit? Press Y to quit or N to resume.',
  );
}
function resume() {
  menu.removeAttribute('aria-label');
  menu.replaceChildren();
  setMode('playing');
  view.hud = true;
  canvas.focus({ preventScroll: true });
}
function results(win: boolean) {
  const activeSim = sim;
  if (!activeSim) {
    return;
  }

  base('', 'dombak4', false);
  setMode('results');
  resultWin = win;
  resultSequence = new ResultSequence({
    win,
    onRow: () => sound('pla_hit', 0.6),
  });
  menu.replaceChildren();
  drawRoundResults(ctx, activeSim, {
    picture,
    win,
    arena,
    round,
    player: runner,
    rows: 0,
  });
  menu.setAttribute(
    'aria-label',
    `${GAME_TABLES.domains[arena - 1].name}, ${win ? 'round ' + round + ' completed' : 'game over'}. Total score ${activeSim.score}. Press any key or click to continue.`,
  );
  if (!win) {
    saved.scores = (saved.scores || [])
      .concat([
        {
          name: 'PRISONER',
          score: activeSim.score,
          kills: activeSim.runners[runner].kills,
        },
      ])
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 10);
    save();
  }
  const next = resultContinuation({ win, arena, round });
  resultsContinue = resultAdvance(() => {
    clearInput();
    if (next.kind === 'menu') {
      mainMenu();
      return;
    }
    if (next.kind === 'freedom') {
      base('FREEDOM');
      body('CONGRATULATIONS!<br><br>YOU HAVE SURVIVED THE DEATHDROME CIRCUIT.');
      button('Main menu', 85, mainMenu);
      return;
    }
    if (!availableArenas.includes(next.arena)) {
      mainMenu();
      return;
    }
    arena = next.arena;
    round = next.round;
    startGame(true);
  });
  const advance = button('', 0, () => resultsContinue?.(), 0, 100);
  advance.className = 'results-continue';
  advance.style.height = '100%';
  advance.setAttribute('aria-label', 'Press any key or click to continue');
  advance.focus({ preventScroll: true });
}

function doorSound(id: string, old: number, height: number) {
  const activeSim = sim;
  if (!activeSim) {
    return;
  }

  if (
    mode !== 'playing' ||
    !((old <= 0.01 && height > old) || (old > 0 && height === 0))
  ) {
    return;
  }
  const group = id.startsWith('key-')
    ? view.doors[id.slice(4)]
    : view.portals[id.slice(7)]?.open;
  let gain = 0.5;
  if (group) {
    const center = new THREE.Box3()
        .setFromObject(group)
        .getCenter(new THREE.Vector3()),
      p = activeSim.runners[runner],
      distance = Math.hypot(center.x - p.x, center.z - p.z);
    gain *= Math.max(0, 1 - distance / 160);
  }
  audio.door(id, old, height, activeSim.elapsed, gain);
}
function input() {
  return readControls(keys);
}
function events() {
  const activeSim = sim;
  if (!activeSim) {
    return;
  }

  for (const e of activeSim.events) {
    view.enhancements?.event(e, activeSim);
    if ((e.type === 'spawn' || e.type === 'destroyed') && e.runner === runner) {
      warningState = { active: false, timer: 0 };
    }
    if (e.type === 'countdown' && e.number <= 3) {
      sound(e.number ? ['', 'one', 'two', 'three'][e.number] : 'go');
    }
    if (e.type === 'scrub') {
      message('SCRUB');
      sound('scrub');
    }
    if (e.type === 'shot' && e.runner === runner) {
      sound(e.missile ? 'wea_hom' : 'wea_pla', 0.3);
    }
    if (e.type === 'jump' && e.runner === runner) {
      sound('run_jump');
    }
    if (e.type === 'land' && e.runner === runner) {
      sound('run_land');
    }
    if (e.type === 'pickup' && e.runner === runner) {
      message(e.name + ' PICKED UP');
      sound('enh_capt');
    }
    if (e.type === 'keepMoving') {
      message(e.text, 'red');
      sound('keepmove');
      sound('pla_hit', 0.3);
      visuals.burst(e.point, false, activeSim.elapsed + 7.1);
    }
    if (e.type === 'selfKill') {
      message(e.text, RUNNER_SHADES[e.runner]);
    }
    if (e.type === 'paletteFlash' && e.runner === runner) {
      paletteFlash.trigger();
    }
    if (e.type === 'returnToDomain') {
      message(e.text, RUNNER_SHADES[e.runner]);
    }
    if (e.type === 'destroyed') {
      visuals.burst(activeSim.runners[e.runner], true, activeSim.elapsed + 7.1);
      sound('run_disr', 0.3);
      if (e.reason !== 'outsideDomain' && e.reason !== 'keepMoving') {
        message(
          e.owner != null && e.owner !== e.runner
            ? `${runnerName(activeSim.runners[e.owner], GAME_TABLES)} KILLED ${runnerName(activeSim.runners[e.runner], GAME_TABLES)} WITH ${e.weapon}`
            : `${runnerName(activeSim.runners[e.runner], GAME_TABLES)} DIED`,
          RUNNER_SHADES[e.owner ?? e.runner],
        );
      }
      if (
        e.owner === runner &&
        !exitAnnounced &&
        activeSim.runners[runner].kills >= activeSim.requiredKills
      ) {
        exitAnnounced = true;
        sound('youexit');
        message('RETURN TO DOMAIN ' + GAME_TABLES.domains[arena - 1].name);
      }
    }
    if (e.type === 'hit') {
      visuals.burst(
        activeSim.runners[e.runner],
        false,
        activeSim.elapsed + 7.1,
      );
      if (e.runner === runner) {
        sound('run_hit1', 0.3);
      }
    }
    if (e.type === 'recharge' && e.runner === runner) {
      message('ENERGY RECHARGED');
      sound('key_capt');
    }
    if (e.type === 'matchingWeapons' && e.runner === runner) {
      message('MATCHING WEAPON BONUS 2000');
      sound('jackpot');
    }
    if (e.type === 'extraLife') {
      message('BONUS LIFE');
      sound('jackpot');
    }
    if (e.type === 'barrier' && e.runner === runner) {
      sound('wea_bar', 0.3);
    }
    if (e.type === 'hotSpot') {
      if (e.action === 'erupting') {
        sound('hotspot', 0.3);
      } else if (e.action === 'armed') {
        sound('hsactive', 0.3);
      }
    }
    if (e.type === 'secondary' && e.runner === runner) {
      sound(
        {
          'ShockWave': 'wea_shk',
          'Disruptor': 'wea_dis',
          'Ion Sword': 'wea_is',
          'NanoShield': 'wea_ns',
          'Nitro Ram': 'wea_nit',
        }[
          e.weapon as
            | 'ShockWave'
            | 'Disruptor'
            | 'Ion Sword'
            | 'NanoShield'
            | 'Nitro Ram'
        ] || 'wea_clik',
      );
    }
    if (e.type === 'escapeStarted') {
      sound('leavedom');
      message(
        runnerName(activeSim.runners[e.runner ?? runner], GAME_TABLES) +
          ' HAS ESCAPED',
        RUNNER_SHADES[e.runner ?? runner],
      );
    }
    if (e.type === 'opponentExitStarted') {
      message(
        runnerName(activeSim.runners[e.runner], GAME_TABLES) + ' HAS ESCAPED',
        RUNNER_SHADES[e.runner],
      );
    }
    if (e.type === 'roundcomplete') {
      results(true);
    }
    if (e.type === 'gameover') {
      results(false);
    }
  }
}
function hud(dt: number) {
  const activeSim = sim;
  if (!activeSim) {
    return;
  }

  if (!activeSim) {
    return;
  }
  if (mode === 'playing') {
    const result = stepHudWarning(
      warningState,
      {
        health: activeSim.runners[runner].health,
        locked: playerIsLocked(activeSim, runner),
      },
      dt,
    );
    if (result.clear) {
      gameMessages = gameMessages.filter((m) => m.tag !== 'warning');
    } else if (result.started) {
      message(warningState.message || '', 'red', 'warning');
    }
  }
  const layout = view.responsiveViewport
    ? responsiveHud.layout($('#stage'), touchUI.media.matches)
    : null;
  view.hudLayout = layout;
  touchUI.setHudLayout(layout);
  const frameOptions = {
    picture,
    messages: gameMessages,
    now: performance.now(),
    warning: warningState,
    reticle: view.hudReticle(
      activeSim.runners[activeSim.runners[runner].missileLockTarget!],
    ),
  };
  if (layout) {
    responsiveHud.draw(ctx, activeSim, runner, frameOptions, layout);
  } else {
    restoreOriginalHud(ctx);
    drawHud(ctx, activeSim, runner, frameOptions);
  }
}
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000 || 0);
  prev = now;
  tick += dt;
  touchUI.updateWeapon(
    sim?.runners[runner]?.weapon ?? null,
    touchWeaponAvailable(sim?.runners[runner]?.weapons),
  );
  if (mode === 'training') {
    updateTraining(dt);
  }
  if (mode === 'credits') {
    updateCredits(dt);
  }
  if (intro) {
    intro.step(dt, introReady);
  }
  if (mode === 'playing' && sim) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      touchUI.beforeStep();
      if (weaponSelection.step(keys)) {
        sim.cycleWeapon(sim.runners[runner]);
      }
      sim.step(1 / 60, input());
      view.follow(
        sim.runners[runner],
        1 / 60,
        input().rearView,
        sim.barrierTrails.states[runner].generating,
        sim.escape,
        sim.entrance,
      );
      events();
      accumulator -= 1 / 60;
      if (mode !== 'playing') {
        break;
      }
    }
    const currentEscape = sim.escape;
    sim.runners.forEach((r, i) => {
      poseRunnerModel(runnerMeshes[i], r, currentEscape);
    });
    sim.pickups.forEach((p, i) => {
      const mesh = pickupMeshes[i];
      mesh.visible = p.cooldown <= 0;
      mesh.rotation.y = pickupYaw(view.camera.position, p);
      mesh.position.y = p.y;
    });
    sim.recharge.orbs.forEach((o, i) => {
      const mesh = rechargeMeshes[i];
      mesh.visible = o.cooldown <= 0;
      mesh.position.set(o.x, o.y, o.z);
    });
    visuals.sync(sim);
    view.enhancements?.sync(sim, dt);
    view.setPlayerSpotlight(sim.runners[runner], sim.escape);
    view.setScrub(sim.scrub);
    view.syncExit(sim);
    view.follow(
      sim.runners[runner],
      0,
      input().rearView,
      sim.barrierTrails.states[runner].generating,
      sim.escape,
      sim.entrance,
    );
    hud(dt);
  } else if (preview) {
    stepRunnerPreview(preview, dt);
    ctx.clearRect(0, 0, 320, 200);
  }
  if (mode === 'results' && resultSequence && sim) {
    resultSequence.step(dt);
    if (resultSequence.finished) {
      resultsContinue?.();
    } else {
      drawRoundResults(ctx, sim, {
        picture,
        win: resultWin,
        arena,
        round,
        player: runner,
        rows: resultSequence.rows,
        flashingRow: resultSequence.flashingRow,
        numberVisible: resultSequence.numberVisible,
      });
    }
    menu.dataset.resultRows = String(resultSequence.rows);
  }
  if (mode === 'paused' && view.responsiveViewport) {
    hud(0);
  }
  paletteBrightness.setFlash(paletteFlash.frame());
  view?.enhancements?.sampleFrame(
    dt,
    mode === 'playing' || !!preview,
    mode === 'paused',
  );
  if (view) {
    view.draw(
      sim ? sim.elapsed + Math.min(7.1, 7.1 - sim.countdown) : tick,
      sim?.time ?? 300,
    );
  }
  if (intro) {
    drawIntro();
  }
  if (sim && Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
    const p = sim.runners[runner];
    canvas.setAttribute(
      'aria-label',
      `${GAME_TABLES.domains[arena - 1].name}, round ${round}, health ${Math.ceil(p.health)}, ${p.kills} of ${sim.requiredKills} kills, ${Math.ceil(sim.time)} seconds remaining`,
    );
  }
  if (msgUntil && now > msgUntil) {
    notice.textContent = '';
    msgUntil = 0;
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (e.ctrlKey || e.metaKey)) {
    clearInput();
    return;
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) {
      navigateBack('keyboard');
    }
    return;
  }
  if (mode === 'results') {
    if (e.code === 'KeyM' && !e.repeat) {
      audio.toggleMusic();
    }
    e.preventDefault();
    resultsContinue?.(e);
    return;
  }
  if (
    e.code === 'KeyM' &&
    !e.repeat &&
    !(e.target instanceof Element && e.target.matches('input,select'))
  ) {
    e.preventDefault();
    audio.toggleMusic();
    return;
  }
  if (e.target instanceof Element && e.target.matches('input,select')) {
    return;
  }
  if (mode === 'loading') {
    e.preventDefault();
    return;
  }
  if (
    [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyQ',
      'KeyE',
      'KeyR',
      'KeyB',
      'KeyT',
      'Space',
      'ControlLeft',
      'ControlRight',
      'AltLeft',
      'AltRight',
      'ShiftLeft',
      'ShiftRight',
      'Tab',
    ].includes(e.code)
  ) {
    e.preventDefault();
  }
  touchUI.key(e.code, true);
  if (
    mode === 'training' &&
    !e.repeat &&
    ['ArrowLeft', 'ArrowRight'].includes(e.code)
  ) {
    training(trainingPage + (e.code === 'ArrowLeft' ? -1 : 1));
    return;
  }
  if (mode === 'paused' && !e.repeat) {
    if (e.code === 'KeyY') {
      quitGame();
      return;
    }
    if (e.code === 'KeyN') {
      resume();
      return;
    }
  }

  if (mode === 'menu' && menuActions) {
    const actions: Record<string, 'left' | 'right' | 'enter'> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Enter: 'enter',
    };
    const action = actions[e.code];
    if (action && menuActions[action]) {
      e.preventDefault();
      if (!e.repeat) {
        menuActions[action]();
      }
      return;
    }
  }
  if (mode === 'menu' && ['ArrowDown', 'ArrowUp'].includes(e.code)) {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button')];
    nextMenuButton(
      buttons,
      document.activeElement,
      e.code === 'ArrowDown' ? 1 : -1,
    )?.focus();
    sound(MENU_SOUNDS.move, 0.5);
  }
});
window.addEventListener('keyup', (e) => touchUI.key(e.code, false));
window.addEventListener('focus', () => audio.setSuspended(document.hidden));
window.addEventListener('blur', () => {
  audio.setSuspended(true);
  clearInput();
  if (mode === 'playing') {
    pause();
  }
});
document.addEventListener('visibilitychange', () => {
  audio.setSuspended(document.hidden || !document.hasFocus());
  if (document.hidden) {
    clearInput();
    if (mode === 'playing') {
      pause();
    }
  }
});
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    // Fullscreen the document so the existing 8:5 viewport fitting still applies.
    else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Browsers can reject fullscreen requests after an interrupted gesture.
  }
}
$('#fullscreen').onclick = toggleFullscreen;
$('#sound').onclick = () => audio.setMuted(!audio.muted);
$('#music').onclick = () => audio.toggleMusic();
touchUI = new TouchControls({
  keys,
  bitmapLabel,
  resourceURL,
  getPose: () => sim?.runners[runner],
});
installMenuTaps(menu, {
  getMode: () => mode,
  onBackgroundTap: resume,
  surface: document,
});
installEdgeBack({
  events: document,
  onBack: navigateBack,
  edgeWidth: () => touchUI.edgeWidth(),
  enabled: () => ['menu', 'training', 'credits', 'results'].includes(mode),
});
installTopTap({
  events: document,
  onTap: pause,
  enabled: () => mode === 'playing' && touchUI.media.matches,
  topHeight: () => touchUI.topTapHeight(),
});
try {
  installBackGuard({
    history: window.history,
    location: window.location,
    events: window,
    onBack: navigateBack,
  });
} catch (error) {
  console.warn('Browser Back handling is unavailable', error);
}
document.addEventListener('contextmenu', (e) => e.preventDefault());
let interfaceError = null;
try {
  view = new View(canvas);
  view.setEnhancedGraphics(audio.options.enhancedGraphics);
  view.detail = audio.options.detail;
  mainMenu();
  requestAnimationFrame(frame);
} catch (e) {
  interfaceError = e;
  menu.textContent =
    'WebGL is unavailable in this browser. Enable hardware acceleration to play.';
  console.error(e);
}

export const ready = (async () => {
  if (interfaceError) {
    throw interfaceError;
  }
  await Promise.all([
    touchUI.ready,
    bitmapFontsReady(),
    ...Array.from(menu.querySelectorAll<HTMLImageElement>('img'), imageReady),
  ]);
  await new Promise((resolve) => requestAnimationFrame(resolve));
})();
