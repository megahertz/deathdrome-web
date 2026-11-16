import { errorMessage } from '../../src/errors.ts';
import './diagnostic-setup.ts';
import { drawOpaqueSolidPolygon } from '../../src/solid-spans.ts';
import { SpanBuffer } from '../../src/span-buffer.ts';
import { drawIndexedTexturePolygon } from '../../src/texture-spans.ts';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error('Missing diagnostic element: ' + selector);
  }
  return element;
};
try {
  const fixtures = await fetch('overlap-check-fixtures.json').then((r) =>
      r.json(),
    ),
    canvas = $<HTMLCanvasElement>('#comparison'),
    ctx = canvas.getContext('2d')!;
  let compared = 0,
    mismatches = 0,
    frames = 0;
  const paint = (
    pixels: string | any[] | Uint8Array<ArrayBuffer>,
    x: number,
    y: number,
  ) => {
    const image = ctx.createImageData(320, 200);
    for (let i = 0; i < pixels.length; i++) {
      const n = pixels[i];
      image.data.set(
        n === 255 ? [7, 11, 16, 255] : [n, 255 - n, (n * 37) % 256, 255],
        i * 4,
      );
    }
    ctx.putImageData(image, x, y);
  };
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    for (const axis of [0, 1]) {
      const native = Uint8Array.from(atob(fixture.nativePixels[axis]), (c) =>
          c.codePointAt(0)!,
        ),
        target = new Uint8Array(64_000).fill(255),
        buffer = new SpanBuffer(200);
      for (const p of fixture.polygons) {
        const [width, height] = p.size,
          pixels = Uint8Array.from({ length: width * height }, (_, i) =>
            axis ? Math.floor(i / width) % 256 : (i % width) % 256,
          );
        if (p.kind === 'solid') {
          drawOpaqueSolidPolygon(target, 320, p.vertices, p.color, {
            ...p,
            spanBuffer: buffer,
          });
        } else {
          drawIndexedTexturePolygon(
            target,
            320,
            p.vertices,
            { width, height, pixels },
            { ...p, spanBuffer: buffer },
          );
        }
      }
      for (let i = 0; i < target.length; i++) {
        compared++;
        if (target[i] !== native[i]) {
          mismatches++;
        }
      }
      const y = (fixtureIndex * 2 + axis) * 200;
      paint(native, 0, y);
      paint(target, 320, y);
      frames++;
    }
  }
  $('#status').textContent = JSON.stringify(
    {
      passed: mismatches === 0,
      frames,
      comparedIndexBytes: compared,
      mismatches,
      scope:
        'Supplied projected opaque polygons. Full scene setup, lighting and other material paths remain open.',
    },
    null,
    2,
  );
  $<HTMLAnchorElement>('#export').href = canvas.toDataURL('image/png');
} catch (error) {
  $('#status').textContent = 'Failed: ' + errorMessage(error);
  console.error(error);
}
