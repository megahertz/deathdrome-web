import {GAME_TABLES} from './game-tables.js';
const E=GAME_TABLES.escape,C=E.camera,F=Math.fround,RAD=Math.PI/180;
export function exitCameraPose(p){return p?Object.fromEntries(['x','y','z','pitchDegrees','yawDegrees','rollDegrees'].map(k=>[k,F(p[k]||0)])):null}
function translate(p,x,y,z){p.x=F(p.x+F(x));p.y=F(p.y+F(y));p.z=F(p.z+F(z))}
// The original divides by the newly stored timer and only clamps above one.
function factor(dt,remaining){return Math.min(1,F(dt/remaining))}
export function stepExitPose(sim,r,e,seconds,human=false){
 const dt=F(seconds),phase=e.phase,c=human?e.camera:null;e.remaining=F(e.remaining-dt);
 if(phase==='center'){
  sim.exitHangar.moving=true;const a=factor(dt,e.remaining);translate(r,-r.x*a,-r.y*a,-r.z*a);
  if(c){let dx=F(c.x-r.x),dy=F(F(r.y+C.lookHeight)-c.y),dz=F(c.z-r.z);c.pitchDegrees=F(Math.atan2(dy,F(Math.hypot(dx,dz)))/RAD);c.yawDegrees=F(Math.atan2(dx,dz)/RAD);c.rollDegrees=0}
 }else if(phase==='fold'){
  let pitch=e.remaining>2.6?0:F((E.foldSeconds-e.remaining)*E.foldDegreesPerSecond);
  e.foldDegrees=pitch>=90?E.maximumFoldDegrees:pitch;
  if(c){
   c.pitchDegrees=e.foldDegrees;
   const a=factor(dt,e.remaining),distance=F(Math.hypot(c.x,c.z));let x=0,z=0;
   if(distance>C.distance){const amount=F(F(distance-C.distance)*a),yaw=c.yawDegrees*RAD;x=-amount*F(Math.sin(yaw));z=-amount*F(Math.cos(yaw))}
   translate(c,x,-(c.y+C.depth)*a,z);
  }
 }else if(phase==='rise'){
  const distance=F(dt*(human?E.riseSpeed:E.aiRiseSpeed));translate(r,0,distance,0);
  if(c)translate(c,0,distance*C.riseFactor,0);
 }
 if(e.remaining>0)return false;
 if(phase==='delay'){e.phase='center';e.remaining=E.centerSeconds}
 else if(phase==='center'){Object.assign(r,{x:0,y:0,z:0});e.phase='fold';e.remaining=E.foldSeconds}
 else if(phase==='fold'){
  if(c){let yaw=F(c.yawDegrees+C.reverseDegrees)*RAD;c.x=F(-F(Math.sin(yaw))*C.distance);c.z=F(-F(Math.cos(yaw))*C.distance)}
  e.phase='rise';e.remaining=E.riseSeconds;
 }else{e.phase='complete';return true}
 return false;
}
