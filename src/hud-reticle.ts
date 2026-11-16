import type { Vec3 } from './game-types.ts';
const f = Math.fround;
// Native 417664 -> 458b78. Input is camera-local (+Z forward, +Y down).
// The FOV comes from RUN/CAMERAX.GW; the gameplay viewport excludes the HUD.
export function projectReticle(point: Vec3, { small = false } = {}) {
  const scale = small ? 1 : 2,
    width = 320 * scale,
    height = 138 * scale,
    top = 17 * scale;
  const depth = f(point.z),
    inverse = depth ? f(1 / depth) : 1;
  const x = f(
    f(point.x) * inverse * f(width / 2 / Math.tan((31 * Math.PI) / 180)) +
      width / 2,
  );
  const y = f(
    f(point.y) * inverse * f(height / 2 / Math.tan((17.5 * Math.PI) / 180)) +
      height / 2 +
      top,
  );
  const left = Math.trunc(Math.max(15, Math.min(width - 20, f(x - 4 * scale))));
  const upper = Math.trunc(
    Math.max(top + 10, Math.min(top + height - 16, f(y - 4 * scale))),
  );
  return {
    x: small ? left : left >> 1,
    y: small ? upper : upper >> 1,
    width: 8,
    height: 8,
  };
}
