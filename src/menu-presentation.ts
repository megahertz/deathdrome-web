import { resourceURL } from './resource-urls.ts';
// Menu bank at 48d2d8: 0=max, 2=chc_maxr, 3=chc_mid.
// Frame expansion: 41b74c..41b8e7, centre (160,100), edges move
// 3 horizontal / 2 vertical pixels per original iteration.
export const MENU_SOUNDS = { enter: 'max', back: 'chc_maxr', move: 'chc_mid' };
export function animateMenuBack(
  stage: HTMLElement,
  menu: HTMLElement,
  snapshot: CanvasImageSource,
) {
  stage.querySelector<HTMLElement>('.menu-entry-frame')?.remove();
  menu.classList.remove('menu-entering');
  const frame = document.createElement('canvas');
  frame.className = 'menu-entry-frame';
  frame.width = 320;
  frame.height = 200;
  frame.setAttribute('aria-hidden', 'true');
  stage.append(frame);
  const g = frame.getContext('2d')!,
    start = performance.now();
  g.imageSmoothingEnabled = false;
  function step(now: number) {
    if (!frame.isConnected) {
      return;
    }
    const t = (now - start) / 240;
    if (t >= 1) {
      frame.remove();
      return;
    }
    g.clearRect(0, 0, 320, 200);
    if (t < 0.5) {
      g.drawImage(snapshot, 0, 0, 320, 200);
    }
    g.fillStyle = `rgba(0,0,0,${t < 0.5 ? t * 2 : (1 - t) * 2})`;
    g.fillRect(0, 0, 320, 200);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const frames = new Map();
function picture(name: string) {
  if (!frames.has(name)) {
    const im = new Image();
    im.src = resourceURL(`assets/images/${name}.png`);
    frames.set(name, im);
  }
  return frames.get(name);
}
export function drawMenuFrame(
  g: CanvasRenderingContext2D,
  progress: number,
  getPicture = picture,
  clear = true,
) {
  if (clear) {
    g.clearRect(0, 0, 320, 200);
  }
  g.imageSmoothingEnabled = false;
  const n = Math.round(Math.max(0, Math.min(1, progress)) * 55),
    x = 160 - 3 * n,
    y = 100 - 2 * n,
    w = 6 * n,
    h = 4 * n;
  const image = (
    name: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ) => {
    const im = getPicture(name);
    if (im?.complete && im.naturalWidth) {
      g.drawImage(im, left, top, width, height);
    }
  };
  image('scrubyl', x, y, 5, h);
  image('scrubyr', x + w - 5, y, 5, h);
  image('scrubxu', x, y, w, 5);
  image('scrubxb', x, y + h - 5, w, 5);
  for (const [cx, cy] of [
    [x, y],
    [x + w - 5, y],
    [x, y + h - 5],
    [x + w - 5, y + h - 5],
  ]) {
    image('scrubcor', cx, cy, 5, 5);
  }
}
export function animateMenuEntry(
  stage: HTMLElement,
  menu: HTMLElement,
  enabled = true,
) {
  stage.querySelector<HTMLElement>('.menu-entry-frame')?.remove();
  menu.classList.remove('menu-entering');
  if (!enabled) {
    return;
  }
  const bounds = menu.getBoundingClientRect(),
    old = [
      ...menu.querySelectorAll<HTMLImageElement>(
        '.background,.title-art,.key-hint',
      ),
    ].map((im) => {
      const r = im.getBoundingClientRect();
      return {
        im,
        x: ((r.left - bounds.left) / bounds.width) * 320,
        y: ((r.top - bounds.top) / bounds.height) * 200,
        w: (r.width / bounds.width) * 320,
        h: (r.height / bounds.height) * 200,
      };
    });
  const frame = document.createElement('canvas');
  frame.className = 'menu-entry-frame';
  frame.width = 320;
  frame.height = 200;
  frame.setAttribute('aria-hidden', 'true');
  for (const name of ['scrubyl', 'scrubyr', 'scrubxu', 'scrubxb', 'scrubcor']) {
    picture(name);
  }
  const g = frame.getContext('2d')!,
    start = performance.now();
  menu.classList.add('menu-entering');
  stage.append(frame);
  function step(now: number) {
    if (!frame.isConnected) {
      return;
    }
    const progress = (now - start) / 540;
    if (progress >= 1) {
      frame.remove();
      menu.classList.remove('menu-entering');
      return;
    }
    if (old.length > 0) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 320, 200);
      for (const { im, x, y, w, h } of old) {
        if (im.complete && im.naturalWidth) {
          g.drawImage(im, x, y, w, h);
        }
      }
    } else {
      g.clearRect(0, 0, 320, 200);
    }
    drawMenuFrame(g, progress, picture, false);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
