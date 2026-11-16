import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { drawOpaqueSolidPolygon } from '../../src/solid-spans.ts';
import { SpanBuffer, compareSpanDepth } from '../../src/span-buffer.ts';
import { drawIndexedTexturePolygon } from '../../src/texture-spans.ts';
const rows = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/span-buffer-native.json',
        import.meta.url,
      ),
    ).toString(),
  ),
  draws = JSON.parse(
    readFileSync(
      new URL(
        '../../private/verification/opaque-overlaps-native.json',
        import.meta.url,
      ),
    ).toString(),
  );
const canonical = (value: { visible: any[]; row: any[] }) => {
  const serialized = JSON.stringify(value);
  return JSON.parse(serialized);
};
test('span depth comparison matches 3,200 original point/line/crossing cases', () => {
  assert.equal(rows.passed, true);
  assert.equal(rows.comparisonCases, 3200);
  for (const f of rows.comparisons) {
    assert.equal(compareSpanDepth(f.a, f.b), f.native);
  }
});
test('row insertion, splitting, ties and endpoint stores match 8,160 sequential original insertions', () => {
  assert.equal(rows.insertionCases, 8160);
  for (const sequence of rows.sequences) {
    const buffer = new SpanBuffer(1);
    for (const [i, s] of sequence.incoming.entries()) {
      const visible = buffer.insert(0, s);
      assert.deepEqual(
        canonical({ visible, row: buffer.rows[0] }),
        canonical(sequence.native[i]),
      );
    }
    buffer.clear();
    assert.deepEqual(buffer.rows, [[]]);
  }
});
function rowHash(buffer: SpanBuffer) {
  const hash = createHash('sha256');
  for (const row of buffer.rows) {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(row.length);
    hash.update(n);
    for (const s of row) {
      const b = Buffer.alloc(20);
      b.writeInt32LE(s.x0, 0);
      b.writeInt32LE(s.x1, 4);
      b.writeFloatLE(s.q0, 8);
      b.writeFloatLE(s.q1, 12);
      b.writeFloatLE(s.dq, 16);
      hash.update(b);
    }
  }
  return hash.digest('hex');
}
test('mixed opaque rendering matches original pixels, texture commands and depth records after every polygon', () => {
  assert.equal(draws.passed, true);
  assert.equal(draws.nativeDraws, 1024);
  assert.equal(draws.solidNativeDraws, 342);
  for (const fixture of draws.fixtures) {
    for (const axis of [0, 1]) {
      const target = new Uint8Array(64_000).fill(255),
        buffer = new SpanBuffer(200);
      for (const [i, p] of fixture.polygons.entries()) {
        const [width, height] = p.size,
          pixels = Uint8Array.from({ length: width * height }, (_, index) =>
            axis ? Math.floor(index / width) % 256 : (index % width) % 256,
          ),
          commands =
            p.kind === 'solid'
              ? drawOpaqueSolidPolygon(target, 320, p.vertices, p.color, {
                  ...p,
                  spanBuffer: buffer,
                })
              : drawIndexedTexturePolygon(
                  target,
                  320,
                  p.vertices,
                  { width, height, pixels },
                  { ...p, spanBuffer: buffer },
                );
        const raw = Buffer.alloc(commands.length * 36);
        for (const [index, c] of commands.entries()) {
          for (const [j, k] of [
            'kind',
            'x',
            'y',
            'count',
            'u',
            'v',
            'du',
            'dv',
            'color',
          ].entries()) {
            raw.writeInt32LE(
              (k === 'kind'
                ? Number(p.kind === 'solid')
                : (c[k as keyof typeof c] ?? 0)) | 0,
              index * 36 + j * 4,
            );
          }
        }
        const expected = fixture.native[axis][i];
        assert.equal(
          createHash('sha256').update(target).digest('hex'),
          expected.frameHash,
        );
        assert.equal(
          createHash('sha256').update(raw).digest('hex'),
          expected.commandHash,
        );
        assert.equal(commands.length, expected.commandCount);
        assert.equal(rowHash(buffer), expected.rowHash);
      }
    }
  }
});
