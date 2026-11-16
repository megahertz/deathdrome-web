// The supplied JPEG has an opaque dark rectangular matte. Retain the colored
// glyph pixels, but derive alpha from their color separation instead of
// brightening the entire rectangle with CSS screen blending.
const bullet = [
  [61, 106],
  [69, 97],
  [70, 89],
  [82, 86],
  [88, 76],
  [96, 73],
  [103, 62],
  [110, 63],
  [118, 54],
  [128, 59],
  [124, 72],
  [115, 77],
  [112, 86],
  [104, 90],
  [100, 102],
  [92, 104],
  [87, 117],
  [77, 126],
  [72, 117],
  [63, 121],
  [68, 113],
];
function inside(points: string | any[], x: number, y: number) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      result = !result;
    }
  }
  return result;
}
export function transparentTouchIcon(
  data: number[] | Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  name: string | number[],
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      let color;
      if (name === 'FIRE') {
        color = r - Math.max(g, b);
      } else if (name === 'JUMP') {
        color = g - Math.max(r, b);
      } else if (name === 'BARRIER') {
        color = Math.min(g, b) - r;
      } else {
        color = r - b;
      }

      let alpha = Math.max(0, Math.min(255, (color - 18) * 6));
      // Preserve the screenshot's gray projectile inside the orange cycle icon;
      // neutral-colored steel at the crop corners remains transparent.
      if (
        name === 'WEAPON' &&
        inside(bullet, (x * 180) / width, (y * 174) / height) &&
        Math.max(r, g, b) > 45
      ) {
        alpha = 255;
      }
      if (name === 'FIRE' && width > 16 && height > 16) {
        alpha *= Math.min(1, Math.min(x, y, width - 1 - x, height - 1 - y) / 8);
      }
      data[i + 3] = Math.round((data[i + 3] * alpha) / 255);
    }
  }
  return data;
}
export function paintTransparentTouchIcon(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  name: string,
) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, 0, 0);
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
  transparentTouchIcon(pixels.data, canvas.width, canvas.height, name);
  g.putImageData(pixels, 0, 0);
}
