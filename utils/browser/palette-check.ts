import { errorMessage } from '../../src/errors.ts';
import './diagnostic-setup.ts';
import {
  PaletteBrightness,
  paletteBrightness,
} from '../../src/palette-brightness.ts';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error('Missing diagnostic element: ' + selector);
    }
    return element;
  },
  svg = $('#swatches'),
  patches = $('#patches'),
  filter = new PaletteBrightness(patches),
  colors = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (37 * i) % 256]);
for (let i = 0; i < 10; i++) {
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = String(i);
  $<HTMLSelectElement>('#level').append(option);
}
$<HTMLSelectElement>('#level').value = '4';
for (const [i, color] of colors.entries()) {
  const rect = document.createElementNS(svg.namespaceURI, 'rect');
  rect.setAttribute('x', String((i % 32) * 8));
  rect.setAttribute('y', String(Math.floor(i / 32) * 8));
  rect.setAttribute('width', String(8));
  rect.setAttribute('height', String(8));
  rect.setAttribute('fill', `rgb(${color.join(',')})`);
  patches.append(rect);
}
$<HTMLSelectElement>('#level').addEventListener('change', () =>
  filter.setLevel(Number($<HTMLSelectElement>('#level').value)),
);
async function renderPNG() {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.prepend(filter.svg.firstChild.cloneNode(true));
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
      type: 'image/svg+xml',
    }),
    url = URL.createObjectURL(blob),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      data: context.getImageData(0, 0, 256, 64).data,
      png: canvas.toDataURL('image/png'),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function run() {
  $<HTMLButtonElement>('#run').disabled = true;
  $<HTMLSelectElement>('#level').disabled = true;
  $('#exports').replaceChildren();
  const results = [];
  try {
    for (let level = 0; level < 10; level++) {
      filter.setLevel(level);
      // oxlint-disable-next-line no-await-in-loop -- Render and capture each palette state before changing the shared canvas.
      const { data, png } = await renderPNG(),
        mismatches = [];
      for (const [i, color] of colors.entries()) {
        const offset =
            ((Math.floor(i / 32) * 8 + 4) * 256 + (i % 32) * 8 + 4) * 4,
          actual = data.slice(offset, offset + 4),
          expected = [...paletteBrightness(color, level), 255];
        if (actual.some((v, j) => v !== expected[j])) {
          mismatches.push({ i, actual, expected });
        }
      }
      results.push({
        level,
        entries: 256,
        mismatches: mismatches.length,
        examples: mismatches.slice(0, 3),
      });
      const link = document.createElement('a');
      link.id = 'palette-export-' + level;
      link.download = 'palette-level-' + level + '.png';
      link.href = png;
      link.textContent = 'Level ' + level + ' PNG';
      $('#exports').append(link);
    }
    filter.setLevel(Number($<HTMLSelectElement>('#level').value));
    $('#status').textContent = JSON.stringify(
      {
        passed: results.every((r) => !r.mismatches),
        rgbChannels: 7680,
        levels: results,
      },
      null,
      2,
    );
  } catch (error) {
    $('#status').textContent = 'Failed: ' + errorMessage(error);
    console.error(error);
  } finally {
    $<HTMLButtonElement>('#run').disabled = false;
    $<HTMLSelectElement>('#level').disabled = false;
  }
}
$<HTMLButtonElement>('#run').addEventListener('click', run);
run();
