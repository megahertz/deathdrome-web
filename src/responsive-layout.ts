import { type PerspectiveCamera, type Vector3 } from '#three';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function responsiveHudLayout(
  width: number,
  height: number,
  {
    safe = {},
  }: {
    touch?: boolean;
    safe?: { left?: number; right?: number; top?: number; bottom?: number };
  } = {},
) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const inset = {
    left: Math.max(0, safe.left || 0),
    right: Math.max(0, safe.right || 0),
    top: Math.max(0, safe.top || 0),
    bottom: Math.max(0, safe.bottom || 0),
  };
  const usableWidth = width,
    usableHeight = Math.max(1, height - inset.top - inset.bottom);
  const topScale = Math.max(
    0.25,
    Math.min(3.5, usableWidth / 320, usableHeight / 240),
  );
  // Chrome reaches both viewport edges, including beside landscape cutouts.
  // Keep vertical system insets and reticle safe areas independent of its width.
  const bottomScale = topScale,
    bottomInset = inset.bottom,
    bottomX = 0,
    bottomWidth = usableWidth;
  const top = {
    x: 0,
    y: inset.top,
    width: usableWidth,
    height: 48 * topScale,
    scale: topScale,
  };
  const bottom = {
    x: bottomX,
    y: height - bottomInset - 63 * bottomScale,
    width: bottomWidth,
    height: 63 * bottomScale,
    scale: bottomScale,
  };
  const playTop = inset.top + 17 * topScale,
    playBottom = Math.max(playTop + 1, height - bottomInset - 44 * bottomScale);
  return {
    width,
    height,
    safe: inset,
    top,
    bottom,
    play: { x: 0, y: playTop, width, height: playBottom - playTop },
    pixelRatio: Math.min(2, 2 / Math.min(topScale, bottomScale)),
  };
}
export function responsiveRenderSize(
  width: number,
  height: number,
  pixelRatio = 1,
  quality = 1,
) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const density = clamp(pixelRatio || 1, 1, 2),
    budget = Math.sqrt((1920 * 1200) / (width * height));
  const factor =
    Math.min(density, budget, 4096 / width, 4096 / height) *
    clamp(quality, 0.4, 1);
  const h = Math.max(2, Math.floor((height * factor) / 2) * 2),
    w = Math.max(2, Math.floor((h * width) / height / 2) * 2);
  return { width: w, height: h };
}
export function applyResponsiveProjection(
  camera: PerspectiveCamera,
  layout: {
    width: any;
    height: any;
    safe?: { left: number; right: number; top: number; bottom: number };
    top?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
    bottom?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
    play: any;
    pixelRatio?: number;
  },
) {
  camera.fov = 35;
  camera.near = 0.75;
  camera.far = 1200;
  // Extend the image behind the instruments while retaining the playable
  // vertical field of view. This keeps the player's vehicle above the dashboard.
  camera.setViewOffset(
    layout.width,
    layout.play.height,
    0,
    -layout.play.y,
    layout.width,
    layout.height,
  );
  camera.updateProjectionMatrix();
}
export function responsiveReticle(
  ndc: Pick<Vector3, 'x' | 'y'>,
  layout: {
    width: any;
    height: any;
    safe: any;
    top: any;
    bottom?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
    play: any;
    pixelRatio?: number;
  },
) {
  const size = 8 * layout.top.scale;
  const x = clamp(
    ((ndc.x + 1) * layout.width) / 2 - size / 2,
    layout.safe.left + size,
    Math.max(
      layout.safe.left + size,
      layout.width - layout.safe.right - size * 2,
    ),
  );
  const y = clamp(
    ((1 - ndc.y) * layout.height) / 2 - size / 2,
    layout.play.y + size,
    Math.max(
      layout.play.y + size,
      layout.play.y + layout.play.height - size * 2,
    ),
  );
  return { x, y, width: size, height: size };
}
