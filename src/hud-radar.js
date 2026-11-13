// Native 417408: 0.091 scale, float-stored rotated offsets, asymmetric edge
// tests and vertical-edge precedence. Coordinates remain logical 320x200.
export function projectRadar(origin,target,forward,baseY=156){
 const f=Math.fround,scale=f(.091),dx=(f(target.x)-f(origin.x))*scale,dz=(f(target.z)-f(origin.z))*scale;
 let x=f(dx*f(forward.z)-dz*f(forward.x)),y=f(dx*f(forward.x)+dz*f(forward.z)),edge=-1;
 if(x>=28){x=30;edge=1}else if(x<=-29){x=-30;edge=0}
 if(y>=16){y=18;edge=3}else if(y<=-16){y=-18;edge=2}
 // Both screen coordinates are positive. Subtracting ceil(offset) preserves
 // x87 truncation at cardinal headings even for a tiny nonzero float offset;
 // doing the subtraction in JS first can round it back to the integer center.
 return {x:251-Math.ceil(x),y:baseY+20-Math.ceil(y),edge};
}
