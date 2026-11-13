import {GAME_TABLES} from './game-tables.js';
export const COLLISION=GAME_TABLES.collision;

export function planarVelocity(r){let c=Math.cos(r.yaw),s=Math.sin(r.yaw),lateral=r.lateralSpeed||0;return {x:c*lateral-s*r.speed,z:-s*lateral-c*r.speed}}
export function setPlanarVelocity(r,v){let c=Math.cos(r.yaw),s=Math.sin(r.yaw);r.lateralSpeed=c*v.x-s*v.z;r.speed=-s*v.x-c*v.z}

// Legacy planar approximation retained for provisional runner-circle contacts
// and callers without a sceneSweep provider. Ordinary arena walls now use
// collision-sweep.js / collision-response.js and the recovered native records.
export function reflectImpact(sim,r,normal,{nitro=false}={}){
 let v=planarVelocity(r),length=Math.hypot(v.x,v.z),nLength=Math.hypot(normal.x,normal.z);
 if(!length||!nLength)return false;
 let nx=normal.x/nLength,nz=normal.z/nLength,dot=v.x*nx+v.z*nz;
 if(dot>=0)return false;
 let incoming={x:v.x/length,z:v.z/length},reflected={x:incoming.x-2*(dot/length)*nx,z:incoming.z-2*(dot/length)*nz};
 let speed=Math.hypot(length,r.vy||0),result=speed*COLLISION.velocityFactor;
 setPlanarVelocity(r,{x:reflected.x*result,z:reflected.z*result});
 r.turn+=Math.sign(reflected.x*incoming.z-incoming.x*reflected.z)*speed*COLLISION.turnDegreesPerSpeed*Math.PI/180;
 if(!nitro&&speed>COLLISION.impactDamageThreshold)sim.damage(r,COLLISION.impactDamage,null,'Collision',{power:false});
 sim.emit('collision',{runner:r.id,normal:{x:nx,z:nz},speed,nitro});return true;
}

// Circle contact bounds are still provisional. Resolve the full overlap so
// the same incoming velocities cannot grind health away while interpenetrating.
export function runnerOverlap(a,b){
 let x=a.x-b.x,z=a.z-b.z,length=Math.hypot(x,z);
 if(length>=4||Math.abs(a.y-b.y)>=3||a.dead||b.dead)return null;
 let normal=length?{x:x/length,z:z/length}:{x:1,z:0},va=planarVelocity(a),vb=planarVelocity(b),offset=(4.0001-length)*.5;
 a.x+=normal.x*offset;a.z+=normal.z*offset;b.x-=normal.x*offset;b.z-=normal.z*offset;
 return {normal,aImpact:va.x*normal.x+va.z*normal.z<0,bImpact:vb.x*normal.x+vb.z*normal.z>0};
}
