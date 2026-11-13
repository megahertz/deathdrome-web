import {GAME_TABLES} from './game-tables.js';
import {runnerCockpitRoll} from './runner-pose.js';
export const EMITTER=GAME_TABLES.combat.emitters;
const f=Math.fround;
// Native 441320 uses a float 3x4 matrix, rounding after each local operation.
function translate(m,[x,y,z]){for(let i=0;i<3;i++)m[9+i]=f(((x*m[i]+y*m[3+i])+z*m[6+i])+m[9+i])}
function rotate(m,axis,degrees){
 const a=f(degrees)*EMITTER.rotationPi/180,c=f(Math.cos(a)),s=f(Math.sin(a)),old=m.slice();
 const [u,v]=axis==='x'?[1,2]:axis==='y'?[2,0]:[0,1];
 for(let i=0;i<3;i++){m[u*3+i]=f(old[u*3+i]*c+old[v*3+i]*s);m[v*3+i]=f(old[v*3+i]*c-old[u*3+i]*s)}
}
export function emitterMatrix(r,human=true){
 let m=[1,0,0,0,1,0,0,0,1,0,0,0],pitch=f(r.chassisPitchDegrees??0);
 if(r.actionMode===2)pitch=f(pitch+(f(r.y)-f(r.baseHeight??0))*EMITTER.jumpPitchFactor);
 translate(m,[f(r.x),0,f(r.z)]);rotate(m,'y',r.yaw*180/Math.PI);translate(m,[0,0,EMITTER.yawPivotZ]);translate(m,[0,f(r.y),0]);rotate(m,'x',pitch);
 if(human){rotate(m,'z',r.chassisRollDegrees??0);translate(m,EMITTER.chassisPivot);if(r.actionMode===2)rotate(m,'x',f(-pitch*EMITTER.jumpCounterPitchFactor));rotate(m,'z',r.cockpitRollDegrees??runnerCockpitRoll(r));translate(m,EMITTER.cockpitPivot)}
 return m;
}
export function emitterOrigins(r,human=true){
 const m=emitterMatrix(r,human);
 return EMITTER[human?'human':'ai'].map(([x,y,z])=>({x:f(((x*m[0]+y*m[3])+z*m[6])+m[9]),y:f(((x*m[1]+y*m[4])+z*m[7])+m[10]),z:f(((x*m[2]+y*m[5])+z*m[8])+m[11])}));
}
export function projectileForward(r){
 if(r.forwardVector)return {x:f(r.forwardVector.x),y:f(r.forwardVector.y??0),z:f(r.forwardVector.z)};
 const yaw=f(r.yaw*180/Math.PI)*EMITTER.rotationPi/180,pitch=f(r.chassisPitchDegrees??0)*EMITTER.rotationPi/180;
 return {x:f(-Math.sin(yaw)*Math.cos(pitch)),y:f(Math.sin(pitch)),z:f(-Math.cos(yaw)*Math.cos(pitch))};
}
