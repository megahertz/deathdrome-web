// World registration (454260) and opaque texel addressing (44c514/45304c).
const f=Math.fround;
export function registeredTextureCoordinates(vertices,{base=[0,0],repeats=[.0625,.0625]}={}){
 const uv=vertices.map(p=>[f((f(p[0])-f(base[0]))*f(repeats[0])),f((f(p[2])-f(base[1]))*f(repeats[1]))]);
 const origin=[0,1].map(i=>Math.trunc(Math.min(...uv.map(p=>p[i]))));
 return {origin,uv:uv.map(p=>p.map((v,i)=>f(v-origin[i])))};
}
export function nativeTextureTexel(uv,size){return uv.map((v,i)=>{const p=Math.floor(f(f(v)*(size[i]-1)));return ((p%size[i])+size[i])%size[i]})}
export const NATIVE_TEXTURE_GLSL=`
uniform vec2 nativeTextureSize;
vec2 nativeTextureUv(vec2 uv){
 vec2 pixel=mod(floor(uv*(nativeTextureSize-1.0)),nativeTextureSize);
 // PNG rows are in native top-to-bottom order; TextureLoader flips the upload.
 return vec2((pixel.x+0.5)/nativeTextureSize.x,1.0-(pixel.y+0.5)/nativeTextureSize.y);
}
`;
