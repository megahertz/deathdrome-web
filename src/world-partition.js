const f=Math.fround;
// SETUP.GW: origin (-896,896), size (1792,-1792), cells (128,-128),
// inclusion tolerance (3,3). 444418 chooses the cell from min X + .1 and
// max Z - .1; a shape fitting its three-unit margin belongs only to that cell.
export function worldPartition(min,max){
 if(min[0]<-896||max[0]>=896||max[2]>896||min[2]<=-896)return null;
 const x=Math.floor((min[0]+f(.1)+896)/128),z=Math.floor((max[2]+f(-.1)-896)/-128);
 const left=-896+x*128,top=896-z*128;
 if(left-min[0]>3||max[0]-(left+128)>3||max[2]-top>3||(top-128)-min[2]>3)return null;
 return [x,z];
}
export function groundInWorldPartition(bounds,x,z){
 x=f(x);z=f(z);
 if(x<-896||x>=896||z>896||z<=-896)return false;
 const cell=worldPartition(bounds.min,bounds.max);
 return !cell||(Math.floor((x+896)/128)===cell[0]&&Math.floor((z-896)/-128)===cell[1]);
}
// 446764 visits the rectangle of endpoint cells without a one-unit margin.
// As in the native collector, a segment crossing the world bounds is rejected.
export function segmentInWorldPartition(bounds,from,to){
 const minX=Math.min(f(from.x),f(to.x)),maxX=Math.max(f(from.x),f(to.x));
 const minZ=Math.min(f(from.z),f(to.z)),maxZ=Math.max(f(from.z),f(to.z));
 if(minX<-896||maxX>=896||maxZ>896||minZ<=-896)return false;
 // World entries always receive a group broad phase. Touching X/Z ranges
 // fail it (445adc); the polygon's edge tolerance cannot override this.
 if(maxX<=bounds.min[0]||minX>=bounds.max[0]||maxZ<=bounds.min[2]||minZ>=bounds.max[2])return false;
 const cell=worldPartition(bounds.min,bounds.max);
 return !cell||(cell[0]>=Math.floor((minX+896)/128)&&cell[0]<=Math.floor((maxX+896)/128)
  &&cell[1]>=Math.floor((maxZ-896)/-128)&&cell[1]<=Math.floor((minZ-896)/-128));
}
