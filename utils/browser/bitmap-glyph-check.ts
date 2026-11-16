import {
  drawBitmapText,
  bitmapLabel,
  bitmapFontsReady,
  glyphAdvance,
  GLYPHS,
} from '../../src/bitmap-ui.ts';
bitmapLabel('ROUND 1', { color: 'whit' });
await bitmapFontsReady();
const atlas = new Image();
atlas.src = 'assets/fonts/10x_whit.png';
await atlas.decode();
const sizes = [
    [1, 0, 0],
    [0.571515, 83.27, 23.46],
    [0.666667, 12.25, 18.7],
    [1.142857, 14.37, 24.41],
    [1.75, 8.33, 20.17],
    [2.31, 12.9, 8.7],
  ],
  results = [];
for (const [density, x, y] of sizes) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 105;
  const g = canvas.getContext('2d')!;
  g.setTransform(density, 0, 0, density, 0, 0);
  const scale = 1.75,
    label = 'ROUND 1 / 2 KILLS REQUIRED TO ESCAPE';
  drawBitmapText(g, label, x, y, { scale });
  const reference = document.createElement('canvas');
  reference.width = canvas.width;
  reference.height = canvas.height;
  const r = reference.getContext('2d')!;
  r.setTransform(density, 0, 0, density, 0, 0);
  r.imageSmoothingEnabled = false;
  let left = x;
  for (const c of label) {
    const index = GLYPHS.indexOf(c);
    if (index >= 0) {
      const isolated = document.createElement('canvas');
      isolated.height = 10;
      isolated.width = isolated.height;
      isolated
        .getContext('2d')!
        .drawImage(atlas, 0, index * 10, 10, 10, 0, 0, 10, 10);
      r.drawImage(isolated, left, y, 10 * scale, 10 * scale);
    }
    left += glyphAdvance(c, 10) * scale;
  }
  const a = g.getImageData(0, 0, canvas.width, canvas.height).data,
    b = r.getImageData(0, 0, canvas.width, canvas.height).data;
  let differingPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      a[i] !== b[i] ||
      a[i + 1] !== b[i + 1] ||
      a[i + 2] !== b[i + 2] ||
      a[i + 3] !== b[i + 3]
    ) {
      differingPixels++;
    }
  }
  const description = document.createElement('div');
  description.textContent = `Backing scale ${density}, position ${x},${y}: ${differingPixels} differing pixels`;
  document.querySelector<HTMLElement>('#cases')!.append(description, canvas);
  results.push({ density, x, y, differingPixels });
}
const state = document.querySelector<HTMLElement>('#state')!;
state.className = results.every((r) => !r.differingPixels) ? 'pass' : 'fail';
state.textContent = JSON.stringify(
  { passed: results.every((r) => !r.differingPixels), results },
  null,
  2,
);
