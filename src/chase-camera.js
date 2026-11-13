import {GAME_TABLES} from './game-tables.js';
import {originalDamping} from './drive.js';
export const CAMERA=GAME_TABLES.camera;
const RAD=Math.PI/180;
export function updateLook(r,left=false,right=false){
 let value=r.lookDegrees||0;
 if(left&&right)value=0;
 else if(left)value+=CAMERA.lookStep;
 else if(right)value-=CAMERA.lookStep;
 else if(Math.abs(value)<CAMERA.lookCenterThreshold)value=0;
 else value-=Math.sign(value)*CAMERA.lookStep;
 r.lookDegrees=Math.max(-CAMERA.lookLimit,Math.min(CAMERA.lookLimit,value));
}
export class ChaseCamera{
 reset(){this.runner=null}
 follow(r,dt,rear=false,barrier=false){
  if(this.runner!==r.id){this.runner=r.id;this.distance=CAMERA.restDistance;this.height=r.y+CAMERA.height;this.bank=0;this.pitch=0}
  if(rear){let distance=-CAMERA.rearOffset[2];return {x:r.x-Math.sin(r.yaw)*distance,y:r.y+CAMERA.rearOffset[1],z:r.z-Math.cos(r.yaw)*distance,yaw:r.yaw+Math.PI,pitch:0}}
  let speed=Math.hypot(r.speed,r.vy||0),activeBarrier=barrier&&r.speed>40,desiredDistance=activeBarrier?CAMERA.barrierDistance:CAMERA.restDistance+speed*CAMERA.speedDistanceFactor,desiredHeight=activeBarrier?CAMERA.barrierHeight:CAMERA.height;
  let damping=originalDamping(dt*CAMERA.distanceDamping);this.distance=this.distance*damping+desiredDistance*(1-damping);
  let weight=Math.max(CAMERA.bankMinimumWeight,speed*CAMERA.bankSpeedFactor),bankTarget=r.speed>0&&speed>=.5?(r.turn/RAD)*CAMERA.bankTurnFactor+(activeBarrier?CAMERA.barrierBank:0):0;
  if(dt>0)this.bank=Math.max(-CAMERA.bankLimit,Math.min(CAMERA.bankLimit,(1-weight)*this.bank-weight*bankTarget));
  let jumping=r.y>(r.floor??r.y)+.1;
  damping=originalDamping(dt*(jumping?CAMERA.distanceDamping:CAMERA.heightDamping));this.height=this.height*damping+(r.y+desiredHeight)*(1-damping);
  let positionYaw=r.yaw+this.bank*RAD,x=r.x+Math.sin(positionYaw)*this.distance,z=r.z+Math.cos(positionYaw)*this.distance,y=this.height;
  let targetX=r.x-Math.sin(r.yaw)*CAMERA.lookAhead,targetZ=r.z-Math.cos(r.yaw)*CAMERA.lookAhead,targetY=r.y+CAMERA.lookHeight;
  let desiredPitch=Math.atan2(targetY-y,Math.hypot(targetX-x,targetZ-z));damping=originalDamping(dt*(jumping?CAMERA.jumpPitchDamping:CAMERA.pitchDamping));this.pitch=this.pitch*damping+desiredPitch*(1-damping);
  return {x,y,z,yaw:Math.atan2(x-targetX,z-targetZ)+(r.lookDegrees||0)*RAD,pitch:this.pitch};
 }
}
