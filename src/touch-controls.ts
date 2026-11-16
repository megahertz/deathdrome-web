import { imageReady } from './bitmap-ui.ts';
import type { Weapon } from './game-types.ts';
import { paintTransparentTouchIcon } from './touch-icon.ts';
import { TouchInput, TOUCH_CODES } from './touch-input.ts';

// Project-authored steel frames; supplied action glyphs published with owner permission.
// No additional original-disc resources are included in the release.
export function paintTouchDisc(
  canvas: HTMLCanvasElement,
  { active = false, knob = false } = {},
) {
  const size = 96,
    g = canvas.getContext('2d')!;
  canvas.height = size;
  canvas.width = canvas.height;
  const image = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 47.5,
        dy = y - 47.5,
        r = Math.hypot(dx, dy),
        i = (y * size + x) * 4;
      if (r > 46) {
        continue;
      }
      let c = [4, 7, 8];
      const shine = (-dx - dy) / 67;
      if (r > 43) {
        const v = 32 + Math.round((shine * 0.5 + 0.5) * 11) * 12;
        c = [v, v + 4, v + 6];
      } else if (r > 39) {
        const v = 20 + Math.round((shine * 0.5 + 0.5) * 9) * 10;
        c = [v, v + 5, v + 8];
      } else if (r > 37) {
        c = active ? [72, 181, 78] : [26, 45, 50];
      } else if (r > 33) {
        c = [5, 8, 9];
      } else if (knob) {
        const v = 53 + Math.round((shine * 0.5 + 0.5) * 7) * 8;
        c = [v, v + 5, v + 7];
      } else {
        const v =
          7 + Math.floor((33 - r) / 8) * 2 + ((x + y) % 4 === 0 ? 2 : 0);
        c = active ? [v + 7, v + 34, v + 12] : [v, v + 7, v + 5];
      }
      image.data.set([...c, 255], i);
    }
  }
  g.putImageData(image, 0, 0);
  g.imageSmoothingEnabled = false;
  if (!knob) {
    g.fillStyle = active ? '#9bff63' : '#57706a';
    for (const [x, y] of [
      [18, 18],
      [76, 18],
      [18, 76],
      [76, 76],
    ]) {
      g.fillRect(x, y, 2, 2);
    }
  }
}
const glyphs = {
  FIRE: 'loader/touch-icons/fire.png',
  BARRIER: 'loader/touch-icons/barrier.png',
  WEAPON: 'loader/touch-icons/weapon.png',
  JUMP: 'loader/touch-icons/jump.png',
};
export function touchWeaponAvailable(weapons: unknown[] = []) {
  return weapons.some(Boolean);
}
export class TouchControls {
  declare media: MediaQueryList;
  declare mode: string;
  declare weapon: import('./game-types.ts').Weapon | undefined;
  declare resourceURL: (path: string) => string;
  declare input: TouchInput;
  declare root: HTMLDivElement;
  declare stick: HTMLElement;
  declare buttons: Map<
    import('./touch-types.ts').ActionName,
    HTMLDivElement & { _active?: boolean }
  >;
  declare weaponIcon: HTMLImageElement;
  declare safeAreaProbe: HTMLDivElement;
  declare ready: Promise<unknown[]>;
  declare hudOffset: number | undefined;
  declare available: boolean | undefined;

  constructor({
    keys,
    bitmapLabel,
    resourceURL,
    getPose,
  }: {
    keys: Set<string>;
    bitmapLabel: typeof import('./bitmap-ui.ts').bitmapLabel;
    resourceURL: (path: string) => string;
    getPose: () => import('./touch-types.ts').TouchPose | null | undefined;
  }) {
    this.media = matchMedia('(pointer: coarse)');
    this.mode = 'menu';
    this.weapon = undefined;
    this.resourceURL = resourceURL;
    this.input = new TouchInput(keys, {
      getPose,
      vibrate: (ms: number) => {
        try {
          navigator.vibrate?.(ms);
        } catch {
          // Haptics are optional and may be denied by the browser.
        }
      },
    });
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Touch game controls');
    this.root.innerHTML =
      '<div class="touch-drive-zone"></div><div class="touch-action-zone"></div><div class="touch-stick" hidden><canvas class="stick-base"></canvas><canvas class="stick-knob"></canvas></div><div class="touch-diamond"></div>';
    this.stick = this.root.querySelector<HTMLElement>('.touch-stick')!;
    paintTouchDisc(this.stick.querySelector<HTMLCanvasElement>('.stick-base')!);
    paintTouchDisc(
      this.stick.querySelector<HTMLCanvasElement>('.stick-knob')!,
      { knob: true },
    );
    this.buttons = new Map();
    const glyphTasks = [];
    for (const name of ['JUMP', 'WEAPON', 'BARRIER', 'FIRE'] as const) {
      const b = document.createElement('div');
      b.className = 'touch-action touch-' + name.toLowerCase();
      b.dataset.action = name;
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', 'false');
      const art = document.createElement('canvas');
      art.className = 'touch-disc';
      paintTouchDisc(art);
      b.append(art);
      const glyph = document.createElement('canvas'),
        source = new Image();
      glyph.className = 'touch-action-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyphTasks.push(
        new Promise<void>((resolve, reject) => {
          source.addEventListener('load', () => {
            try {
              paintTransparentTouchIcon(glyph, source, name);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          source.addEventListener('error', () =>
            reject(new Error('Could not load touch-control artwork')),
          );
        }),
      );
      source.src = new URL(glyphs[name], import.meta.url).href;
      b.append(glyph);
      const label = bitmapLabel(name, {
        size: 7,
        color: { FIRE: 'red', WEAPON: 'yelo', JUMP: 'gren', BARRIER: 'blue' }[
          name
        ],
      });
      label.classList.add('touch-label');
      b.append(label);
      if (name === 'WEAPON') {
        this.weaponIcon = new Image();
        this.weaponIcon.className = 'touch-weapon-icon';
        this.weaponIcon.alt = '';
        b.append(this.weaponIcon);
      }
      this.root.querySelector<HTMLElement>('.touch-diamond')!.append(b);
      this.buttons.set(name, b);
    }
    this.safeAreaProbe = document.createElement('div');
    this.safeAreaProbe.className = 'touch-safe-area-probe';
    this.safeAreaProbe.setAttribute('aria-hidden', 'true');
    document.body.append(this.root, this.safeAreaProbe);
    const update = (e: PointerEvent) => {
      this.input.move(e.pointerId, e.clientX, e.clientY, e.width, e.height);
      this.draw();
    };
    this.root.addEventListener('pointerdown', (e) => {
      if (
        e.pointerType === 'mouse' ||
        !this.input.enabled ||
        e.clientY <= this.topTapHeight()
      ) {
        return;
      }
      e.preventDefault();
      this.measure();
      if (
        this.input.down(e.pointerId, e.clientX, e.clientY, e.width, e.height)
      ) {
        this.root.setPointerCapture(e.pointerId);
        this.draw();
      }
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.input.pointers.has(e.pointerId)) {
        return;
      }
      e.preventDefault();
      update(e);
    });
    const release = (e: { pointerId: number; preventDefault: () => void }) => {
      if (!this.input.pointers.has(e.pointerId)) {
        return;
      }
      e.preventDefault();
      this.input.up(e.pointerId);
      this.draw();
    };
    this.root.addEventListener('pointerup', release);
    this.root.addEventListener('pointercancel', (e) => {
      this.input.cancel(e.pointerId);
      this.draw();
    });
    this.root.addEventListener('lostpointercapture', (e) => {
      if (this.input.pointers.has(e.pointerId)) {
        this.input.cancel(e.pointerId);
        this.draw();
      }
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    const resize = () => {
      this.reset();
      this.measure();
    };
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    this.media.addEventListener('change', () => this.setMode(this.mode));
    this.updateWeapon(null, false);
    this.ready = Promise.all([...glyphTasks, imageReady(this.weaponIcon)]);
  }
  measure() {
    const { hidden } = this.stick;
    this.stick.hidden = false;
    const rect = this.stick.getBoundingClientRect();
    this.stick.hidden = hidden;
    const buttons = [...this.buttons].map(([name, b]) => {
      const r = b.getBoundingClientRect();
      return {
        name,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        radius: r.width / 2,
      };
    });
    this.input.setGeometry({
      width: document.documentElement.clientWidth,
      radius: (rect.width || 144) / 2,
      buttons,
    });
  }
  setHudLayout(
    layout: {
      width: number;
      height: number;
      safe: { left: number; right: number; top: number; bottom: number };
      top: {
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
      };
      bottom: {
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
      };
      play: { x: number; y: number; width: number; height: number };
      pixelRatio: number;
    } | null,
  ) {
    // The main dashboard starts at source row 156; its decorative band starts
    // at 137. Overlap the visible dashboard, rather than its transparent band.
    const offset = layout
      ? Math.max(0, layout.bottom.height - 19 * layout.bottom.scale - 8)
      : 10;
    if (this.hudOffset === offset) {
      return;
    }
    this.hudOffset = offset;
    this.root.style.setProperty('--touch-hud-offset', offset + 'px');
    if (this.input.enabled) {
      this.measure();
    }
  }
  edgeWidth() {
    return Math.max(28, this.safeAreaProbe.getBoundingClientRect().left + 12);
  }
  topTapHeight() {
    return Math.max(
      44,
      (window.visualViewport?.height || window.innerHeight) * 0.15 +
        this.safeAreaProbe.getBoundingClientRect().top,
    );
  }
  setMode(mode: string) {
    this.mode = mode;
    this.input.enabled = mode === 'playing' && this.media.matches;
    this.root.hidden = !this.input.enabled;
    if (this.input.enabled) {
      this.measure();
    } else {
      this.reset();
    }
  }
  reset(options: { keyboard?: boolean } | undefined = {}) {
    this.input.reset(options);
    this.draw();
  }
  key(code: string, down: boolean) {
    this.input.key(code, down);
  }
  beforeStep() {
    this.input.beforeStep();
    this.draw();
  }
  draw() {
    const p = this.input.stick;
    this.stick.hidden = !p;
    if (p) {
      this.stick.style.left = p.originX + 'px';
      this.stick.style.top = p.originY + 'px';
      const dx = p.x - p.originX,
        dy = p.y - p.originY,
        length = Math.hypot(dx, dy),
        scale = Math.min(
          1,
          (this.input.geometry.radius * 0.52) / (length || 1),
        );
      this.stick.querySelector<HTMLCanvasElement>(
        '.stick-knob',
      )!.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
    }
    const desired = this.input.desired();
    for (const [name, b] of this.buttons) {
      const active = desired.has(TOUCH_CODES[name]);
      if (b.classList.toggle('pressed', active) !== b._active) {
        paintTouchDisc(b.firstElementChild as HTMLCanvasElement, { active });
        b._active = active;
      }
      b.setAttribute('aria-pressed', String(active));
    }
  }
  updateWeapon(weapon: Weapon, available = !!weapon) {
    if (this.weapon === weapon && this.available === available) {
      return;
    }
    this.weapon = weapon;
    this.available = available;
    const icons: Record<string, string> = {
      'Missile': 'sm',
      'Nitro Ram': 'nr',
      'ShockWave': 'sw',
      'Disruptor': 'ds',
      'Ion Sword': 'is',
      'NanoShield': 'ns',
    };
    const id = icons[weapon ?? ''] || 'pl';
    this.weaponIcon.src = this.resourceURL(`assets/hud/big/hud_${id}_h.png`);
    this.buttons.get('WEAPON')!.classList.toggle('no-weapon', !available);
    this.buttons
      .get('WEAPON')!
      .setAttribute('aria-label', `WEAPON — ${weapon || 'Laser'}`);
  }
}
