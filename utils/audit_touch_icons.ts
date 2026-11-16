// Isolated production glyph/frame comparison; this is not a browser screenshot.
import {
  type PathOrFileDescriptor,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';
import { paintTouchDisc } from '../src/touch-controls.ts';
import { transparentTouchIcon } from '../src/touch-icon.ts';
const root = new URL('../', import.meta.url).pathname,
  dimensions = {
    jump: [144, 132],
    weapon: [180, 174],
    barrier: [174, 114],
    fire: [164, 142],
  },
  outW = 384,
  outH = 792,
  out = new Uint8Array(outW * outH * 4),
  reports = [];
for (let i = 0; i < out.length; i += 4) {
  out.set([12, 16, 17, 255], i);
}
function readPNG(path: PathOrFileDescriptor) {
  const file = readFileSync(path),
    idats = [];
  let channels = 0,
    width = 0,
    height = 0;
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at),
      type = file.toString('ascii', at + 4, at + 8),
      data = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9])) {
        throw new Error('Expected eight-bit RGB/RGBA PNG');
      }
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idats.push(data);
    }
    at += length + 12;
  }
  const packed = inflateSync(Buffer.concat(idats)),
    stride = width! * channels!,
    unpacked = new Uint8Array(stride * height!);
  let at = 0;
  for (let y = 0; y < height!; y++) {
    const filter = packed[at++];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels! ? unpacked[y * stride + x - channels!] : 0,
        up = y ? unpacked[(y - 1) * stride + x] : 0,
        corner =
          y && x >= channels! ? unpacked[(y - 1) * stride + x - channels!] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const p = left + up - corner,
          a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - corner);
        if (a <= b && a <= c) {
          predictor = left;
        } else if (b <= c) {
          predictor = up;
        } else {
          predictor = corner;
        }
      } else if (filter !== 0) {
        throw new Error('Invalid PNG row filter');
      }
      unpacked[y * stride + x] = (packed[at++] + predictor) & 255;
    }
  }
  const rgba = new Uint8ClampedArray(width! * height! * 4);
  for (let i = 0; i < width! * height!; i++) {
    rgba.set(unpacked.subarray(i * channels!, i * channels! + 3), i * 4);
    rgba[i * 4 + 3] = channels === 4 ? unpacked[i * channels + 3] : 255;
  }
  return rgba;
}
function savePNG(
  path: PathOrFileDescriptor,
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
) {
  const chunk = (name: string, bytes: string | any[] | NonSharedBuffer) => {
      const type = Buffer.from(name),
        result = Buffer.alloc(bytes.length + 12);
      result.writeUInt32BE(bytes.length);
      type.copy(result, 4);
      Buffer.from(bytes).copy(result, 8);
      result.writeUInt32BE(
        crc32(Buffer.concat([type, Buffer.from(bytes)])),
        bytes.length + 8,
      );
      return result;
    },
    header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
function frame() {
  let pixels!: Uint8ClampedArray;
  const ctx = {
    fillStyle: '',
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: (v: { data: Uint8ClampedArray }) => {
      pixels = v.data;
      return pixels;
    },
    fillRect(x: any, y: any, w: any, h: any) {
      const c = this.fillStyle
        .match(/[\da-f]{2}/gi)!
        .map((v: string) => Number.parseInt(v, 16));
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          pixels.set([...c, 255], (yy * 96 + xx) * 4);
        }
      }
    },
  };
  paintTouchDisc({ getContext: () => ctx } as unknown as HTMLCanvasElement);
  return pixels;
}
function composite(
  base: Uint8ClampedArray,
  source: number[] | Uint8ClampedArray<ArrayBuffer>,
  w: number,
  h: number,
  old: boolean,
) {
  const pixels = new Uint8ClampedArray(base),
    scale = Math.min(57.6 / w, 45.12 / h),
    dw = w * scale,
    dh = h * scale,
    left = 19.2 + (57.6 - dw) / 2,
    top = 19.2 + (45.12 - dh) / 2;
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      if (x < left || x >= left + dw || y < top || y >= top + dh) {
        continue;
      }
      const sx = Math.min(w - 1, Math.floor((x - left) / scale)),
        sy = Math.min(h - 1, Math.floor((y - top) / scale)),
        a = (sy * w + sx) * 4,
        b = (y * 96 + x) * 4,
        alpha = source[a + 3] / 255;
      for (let c = 0; c < 3; c++) {
        pixels[b + c] = old
          ? 255 - ((255 - pixels[b + c]) * (255 - source[a + c])) / 255
          : source[a + c] * alpha + pixels[b + c] * (1 - alpha);
      }
    }
  }
  return pixels;
}
let row = 0;
for (const [name, [w, h]] of Object.entries(dimensions)) {
  const source = readPNG(root + 'public/loader/touch-icons/' + name + '.png'),
    clean = new Uint8ClampedArray(source);
  transparentTouchIcon(clean, w, h, name.toUpperCase());
  let transparent = 0,
    rgbChanges = 0;
  for (let i = 0; i < clean.length; i += 4) {
    if (!clean[i + 3]) {
      transparent++;
    }
    for (let c = 0; c < 3; c++) {
      if (clean[i + c] !== source[i + c]) {
        rgbChanges++;
      }
    }
  }
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(
    (i) => clean[i * 4 + 3],
  );
  reports.push({
    name,
    pixels: w * h,
    transparentPixels: transparent,
    rgbChanges,
    cornersAlpha: corners,
  });
  for (const [col, data] of [
    [0, composite(frame(), source, w, h, true)],
    [1, composite(frame(), clean, w, h, false)],
  ] as const) {
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 192; x++) {
        const p = (Math.floor(y / 2) * 96 + Math.floor(x / 2)) * 4,
          target = ((24 + row * 192 + y) * outW + col * 192 + x) * 4;
        for (let c = 0; c < 3; c++) {
          out[target + c] = Math.round(
            data[p + c] * 0.74 * (data[p + 3] / 255) +
              [12, 16, 17][c] * (1 - (0.74 * data[p + 3]) / 255),
          );
        }
        out[target + 3] = 255;
      }
    }
  }
  row++;
}
const chars = {
  B: ['110', '101', '110', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
  A: ['010', '101', '111', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
};
for (const [label, left] of [
  ['BEFORE', 12],
  ['AFTER', 204],
] as const) {
  for (let n = 0; n < label.length; n++) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        if (chars[label[n] as keyof typeof chars][y][x] === '1') {
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              out.set(
                [170, 193, 169, 255],
                ((6 + y * 2 + dy) * outW + left + n * 8 + x * 2 + dx) * 4,
              );
            }
          }
        }
      }
    }
  }
}
savePNG(
  root + 'private/verification/touch-icon-background-comparison.png',
  out,
  outW,
  outH,
);
const report = {
  scope:
    'Pixel-level execution of production matte removal and steel-frame painting on supplied icon crops. Left: previous CSS screen blend; right: new alpha overlay. Isolated composites, without labels or a live browser scene.',
  reports,
  rgbChanged: false,
  browserScreenshot: false,
};
writeFileSync(
  root + 'private/verification/touch-icon-background.json',
  JSON.stringify(report, null, 2) + '\n',
);
process.stdout.write(JSON.stringify(reports) + '\n');
