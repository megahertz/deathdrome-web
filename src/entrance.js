import {GAME_TABLES} from './game-tables.js';
export const ENTRANCE=GAME_TABLES.entrance;
const F=Math.fround,RAD=Math.PI/180;
export function entranceHeight(elapsed){return Math.max(0,ENTRANCE.hangerHeight+ENTRANCE.hangerVelocity*elapsed)}
function rotate(v,yaw){let s=F(Math.sin(yaw*ENTRANCE.camera.rotationPi/180)),c=F(Math.cos(yaw*ENTRANCE.camera.rotationPi/180));return {x:F(v[0]*c+v[2]*s),y:F(v[1]),z:F(v[2]*c-v[0]*s)}}
function aim(from,to){const x=F(from.x-to.x),y=F(to.y-from.y),z=F(from.z-to.z);return {pitchDegrees:F(Math.atan2(y,F(Math.hypot(x,z)))*ENTRANCE.camera.degreesScale),yawDegrees:F(Math.atan2(x,z)*ENTRANCE.camera.degreesScale),rollDegrees:0}}
export function beginEntrance(sim){
 const local=sim.runners.map(r=>({x:F(r.x),y:F(r.y+ENTRANCE.spawnHeightOffset),z:F(r.z),yawDegrees:F(r.yaw/RAD)})),p=local[sim.player],outside=rotate(ENTRANCE.camera.outside,p.yawDegrees),target=rotate(ENTRANCE.camera.target,p.yawDegrees);
 sim.entrance={active:true,elapsed:0,height:ENTRANCE.hangerHeight,yawDegrees:0,local,outside,target,cameraStage:1,cameraTime:0,cameraLocal:{x:F(outside.x-p.x),y:F(outside.y-F(p.y+ENTRANCE.hangerHeight)),z:F(outside.z-p.z)},cameraAngles:{pitchDegrees:0,yawDegrees:0,rollDegrees:0},announced:[]};sim.countdown=ENTRANCE.seconds;
 applyEntrance(sim);
}
function applyEntrance(sim){
 const e=sim.entrance;
 sim.runners.forEach((r,i)=>{const p=e.local[i],rotated=rotate([p.x,p.y,p.z],e.yawDegrees);Object.assign(r,{x:rotated.x,y:F(p.y+e.height),z:rotated.z,yaw:(p.yawDegrees+e.yawDegrees)*RAD,vy:0})});
 const p=e.local[sim.player],c=e.cameraLocal,rotated=rotate([F(c.x+p.x),F(c.y+p.y),F(c.z+p.z)],e.yawDegrees);
 e.camera={x:rotated.x,y:F(rotated.y+e.height),z:rotated.z,pitchDegrees:e.cameraAngles.pitchDegrees,yawDegrees:F(e.cameraAngles.yawDegrees+e.yawDegrees),rollDegrees:e.cameraAngles.rollDegrees};
 sim.updateEntrance?.(e);
}
function cameraStep(e,dt,player){
 const p=e.local[player],C=ENTRANCE.camera;
 if(e.cameraStage===1){
  // 43b820 aims before replacing the camera's parent-relative offset.
  e.cameraAngles=aim(e.cameraLocal,{x:0,y:e.height,z:0});
  e.cameraLocal={x:F(e.outside.x-p.x),y:F(e.outside.y-F(e.height+p.y)),z:F(e.outside.z-p.z)};
  if(e.height<=e.cameraLocal.y){
   const delta=['x','y','z'].map(k=>e.target[k]-e.cameraLocal[k]);
   e.start={...e.cameraLocal};e.velocity={};e.acceleration={};
   ['x','y','z'].forEach((k,i)=>{let v=delta[i]*C.velocityFactor*C.inverseSeconds;e.velocity[k]=F(v);e.acceleration[k]=F((delta[i]-v*C.seconds)*C.velocityFactor*C.inverseSecondsSquared)});
   e.cameraStage=2;e.cameraTime=0;
  }
 }else{
  e.cameraTime=F(e.cameraTime+dt);const t=e.cameraTime,t2=F(t*t);
  e.cameraLocal=Object.fromEntries(['x','y','z'].map(k=>[k,F(e.start[k]+e.velocity[k]*t+e.acceleration[k]*C.accelerationFactor*t2)]));
  e.cameraAngles=aim({x:F(e.cameraLocal.x+p.x),y:F(e.cameraLocal.y+p.y),z:F(e.cameraLocal.z+p.z)},{x:p.x,y:F(p.y+C.lookHeight),z:p.z});
 }
}
export function stepEntrance(sim,seconds){
 if(!sim.entrance?.active)beginEntrance(sim);
 const e=sim.entrance,dt=F(seconds),C=ENTRANCE.camera;e.elapsed=F(e.elapsed+dt);sim.time-=seconds;sim.countdown=Math.max(0,F(ENTRANCE.seconds-e.elapsed));
 for(let number of [3,2,1])if(sim.countdown<=number&&!e.announced.includes(number)){e.announced.push(number);sim.emit('countdown',{number});break}
 if(e.elapsed>=ENTRANCE.seconds){
  e.active=false;e.height=0;e.yawDegrees=0;e.cameraLocal={...e.target};const p=e.local[sim.player];e.cameraAngles=aim({x:F(p.x+e.target.x),y:F(p.y+e.target.y),z:F(p.z+e.target.z)},{x:p.x,y:F(p.y+C.lookHeight),z:p.z});
  sim.emit('countdown',{number:0});applyEntrance(sim);return;
 }
 if(e.yawDegrees<360)e.yawDegrees=F(ENTRANCE.angularAcceleration*ENTRANCE.angularAccelerationFactor*e.elapsed*e.elapsed+ENTRANCE.angularVelocity*e.elapsed);
 if(e.height>0)e.height=Math.max(0,F(e.height+ENTRANCE.hangerVelocity*dt));
 cameraStep(e,dt,sim.player);applyEntrance(sim);
}
