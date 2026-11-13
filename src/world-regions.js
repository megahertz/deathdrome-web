import {REGION_DATA} from './region-data.js';
const f=Math.fround;
const cache=new Map();

// WorldPartition / WorldAddRegions (444754, 411140, 444d4c, 46bff8).
// A cell may belong to several color regions. Region tests sample its center,
// using normalized X/Z edge normals and the original strict -0.5 tolerance.
function contains(vertices,x,z){
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],dx=f(b[2]-a[2]),dz=f(a[0]-b[0]);
  const length=f(Math.sqrt(dx*dx+dz*dz)),inverse=length?f(1/length):0;
  if((x-a[0])*f(dx*inverse)+(z-a[2])*f(dz*inverse)<=-.5)return false;
 }
 return true;
}
export class WorldRegions{
 constructor(arena){
  const data=REGION_DATA;
  this.origin=data.origin;this.extents=data.extents;this.partition=data.partition;
  this.columns=Math.ceil(data.extents[0]/data.partition[0]);this.rows=Math.ceil(data.extents[1]/data.partition[1]);
  this.masks=new Uint32Array(this.columns*this.rows);this.colors=[];
  for(const face of data.arenas[arena-1]){
   let bit=this.colors.indexOf(face.color);if(bit<0){bit=this.colors.length;this.colors.push(face.color)}
   const vertices=face.vertices.map(p=>p.map(f));
   for(let row=0;row<this.rows;row++)for(let column=0;column<this.columns;column++){
    const x=f(f(column*data.partition[0]+data.origin[0])+f(data.partition[0]*.5));
    const z=f(f(row*data.partition[1]+data.origin[1])+f(data.partition[1]*.5));
    if(contains(vertices,x,z))this.masks[row*this.columns+column]|=1<<bit;
   }
  }
 }
 // 44437c clamps to the world interior before truncating grid coordinates.
 // Inputs and clamped positions are float stores; the scaled quotient is not.
 index(x,z){
  x=f(x);z=f(z);
  const [left,top]=this.origin,right=f(left+this.extents[0]),bottom=f(top+this.extents[1]);
  if(x<left)x=f(left+f(.1));else if(x>=right)x=f(right+f(-.1));
  if(z>top)z=f(top+f(-.1));else if(z<=bottom)z=f(bottom+f(.1));
  const column=Math.trunc((x-left)*f(1/this.partition[0])),row=Math.trunc((z-top)*f(1/this.partition[1]));
  return row*this.columns+column;
 }
 maskAt(x,z){return this.masks[this.index(x,z)]}
}
export function worldRegions(arena){if(!cache.has(arena))cache.set(arena,new WorldRegions(arena));return cache.get(arena)}
