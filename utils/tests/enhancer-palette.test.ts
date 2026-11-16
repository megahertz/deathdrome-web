import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
// Read actual exported PNGs rather than trusting a previously generated
// audit manifest. Indexed PNG scanlines have one byte per source pixel.
function indexedPng(bytes: NonSharedBuffer) {
  const chunks: Record<string, Buffer> = {},
    parts = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at),
      kind = bytes.toString('ascii', at + 4, at + 8),
      data = bytes.subarray(at + 8, at + 8 + length);
    at += length + 12;
    if (kind === 'IDAT') {
      parts.push(data);
    } else {
      chunks[kind as keyof typeof chunks] = data;
    }
  }
  const header = chunks.IHDR;
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4);
  assert.equal(header[8], 8);
  assert.equal(header[9], 3);
  assert.equal(header[12], 0);
  const raw = inflateSync(Buffer.concat(parts)),
    pixels = Buffer.alloc(width * height);
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++];
    assert.ok(filter <= 4);
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        a = x ? pixels[i - 1] : 0,
        b = y ? pixels[i - width] : 0,
        c = x && y ? pixels[i - width - 1] : 0,
        p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      let predict;
      if (filter === 0) {
        predict = 0;
      } else if (filter === 1) {
        predict = a;
      } else if (filter === 2) {
        predict = b;
      } else if (filter === 3) {
        predict = Math.floor((a + b) / 2);
      } else if (pa <= pb && pa <= pc) {
        predict = a;
      } else if (pb <= pc) {
        predict = b;
      } else {
        predict = c;
      }

      pixels[i] = (raw[at++] + predict) & 255;
    }
  }
  return { width, height, pixels, palette: chunks.PLTE, alpha: chunks.tRNS };
}
test('all 640 enhancer PNGs preserve original indexed pixels/palette and key only palette zero', () => {
  const base = new URL('../../', import.meta.url),
    archive = readFileSync(
      new URL('private/original/game/DATA/TEXTURES/texture.zb', base),
    ),
    palette = readFileSync(
      new URL('private/original/game/RUN/domain.act', base),
    );
  const gw = readFileSync(
      new URL('private/original/game/RUN/enhcycle.gw', base),
      'utf8',
    ),
    names = new Set(
      [...gw.matchAll(/CycleTextureSetMap\s+([^\s.]+)\.zim/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    );
  const manifest = JSON.parse(
    readFileSync(
      new URL('private/assets/texture-manifest.json', base),
    ).toString(),
  );
  let count = 0;
  for (const entry of manifest) {
    const stem = entry.name.split('/').at(-1).replace('.zim', '');
    if (!names.has(stem)) {
      continue;
    }
    const png = indexedPng(
      readFileSync(
        new URL('private/assets/' + entry.name.replace('.zim', '.png'), base),
      ),
    );
    assert.equal(png.width, entry.width);
    assert.equal(png.height, entry.height);
    assert.equal(png.width, archive.readUInt16LE(entry.offset + 4));
    assert.equal(png.height, archive.readUInt16LE(entry.offset + 6));
    assert.equal(png.pixels.length, archive.readUInt32LE(entry.offset));
    assert.deepEqual(
      png.palette,
      palette.subarray(0, 768),
      entry.name + ' palette',
    );
    assert.deepEqual(
      png.pixels,
      archive.subarray(
        entry.offset + 16,
        entry.offset + 16 + entry.width * entry.height,
      ),
      entry.name + ' indices',
    );
    assert.ok(png.alpha, entry.name + ' missing alpha');
    assert.equal(png.alpha[0], 0);
    for (let i = 1; i < 256; i++) {
      assert.equal(png.alpha[i] ?? 255, 255, entry.name + ' opaque index ' + i);
    }
    count++;
  }
  assert.equal(names.size, 80);
  assert.equal(count, 640);
});
