// World registration (454260) and opaque texel addressing (44c514/45304c).
const f = Math.fround;
export function registeredTextureCoordinates(
  vertices: number[][],
  { base = [0, 0], repeats = [0.0625, 0.0625] } = {},
) {
  const uv = vertices.map((p: number[]) => [
    f((f(p[0]) - f(base[0])) * f(repeats[0])),
    f((f(p[2]) - f(base[1])) * f(repeats[1])),
  ]);
  const origin = [0, 1].map((i) =>
    Math.trunc(Math.min(...uv.map((p: any[]) => p[i]))),
  );
  return {
    origin,
    uv: uv.map((p: number[]) =>
      p.map((v: number, i: number) => f(v - origin[i])),
    ),
  };
}
export function nativeTextureTexel(uv: number[], size: number[]) {
  return uv.map((v: number, i: number) => {
    const p = Math.floor(f(f(v) * (size[i] - 1)));
    return ((p % size[i]) + size[i]) % size[i];
  });
}
export const NATIVE_TEXTURE_GLSL = `
uniform vec2 nativeTextureSize;
uniform bool enhancedGraphics;
vec2 nativeTextureUv(vec2 uv){
 if(enhancedGraphics){
  vec2 pixel=uv*(nativeTextureSize-1.0)+0.5;
  return vec2(pixel.x/nativeTextureSize.x,1.0-pixel.y/nativeTextureSize.y);
 }
 vec2 pixel=mod(floor(uv*(nativeTextureSize-1.0)),nativeTextureSize);
 // PNG rows are in native top-to-bottom order; TextureLoader flips the upload.
 return vec2((pixel.x+0.5)/nativeTextureSize.x,1.0-(pixel.y+0.5)/nativeTextureSize.y);
}
`;
