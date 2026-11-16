// Reference tests load private geometry; portable tests use a synthetic room.
import { readFileSync, existsSync } from 'node:fs';
import { env } from 'node:process';
import { configureRegionData } from '../../src/region-data.ts';
const source = new URL(
  '../../private/assets/region-data.json',
  import.meta.url,
);
if (!env.DD_PORTABLE_TESTS && existsSync(source)) {
  configureRegionData(JSON.parse(readFileSync(source).toString()));
} else {
  configureRegionData({
    origin: [-1024, 1024],
    extents: [2048, -2048],
    partition: [128, -128],
    arenas: Array.from({ length: 8 }, () => [
      {
        color: 1,
        vertices: [
          [-1024, 0, 1024],
          [1024, 0, 1024],
          [1024, 0, -1024],
          [-1024, 0, -1024],
        ],
      },
    ]),
  });
}
