import {GAME_TABLES} from './game-tables.js';
import {healthAfterDelta} from './health.js';
const f=Math.fround;
export const KEEP_MOVING=Object.freeze({seconds:10,distanceSquared:9,damage:4,kickSpeed:30,diagonal:f(.707),rotationPi:3.141592654});
// 48f1bc / 48f21c are process-lifetime arrays indexed by model, not profile.
// Materialization and domain changes do not clear them. The impact voice pool
// index (48f1b8) is shared with the other 436028 impact callers.
export function createKeepMovingState(){return {timers:Array(8).fill(0),positions:Array.from({length:8},()=>({x:0,y:0,z:0})),impactVoice:0}}

// 436078 runs at the end of physical motion, before primary weapon dispatch
// and the separate zero-health destruction check. Controls can be disabled;
// only movement admission, active/health, selected profile and mode gate it.
export function stepKeepMoving(sim,r,seconds){
 if(sim.multiplayer||sim.keepMovingEnabled===false||r.id!==sim.player||r.health===0||r.dead||r.inactive||r.movementEnabled===false)return false;
 const state=sim.keepMovingState,model=r.id;
 state.timers[model]=f(f(state.timers[model])+f(seconds));
 if(state.timers[model]<KEEP_MOVING.seconds)return false;
 state.timers[model]=0;
 const position={x:f(r.x),y:f(r.y),z:f(r.z)},previous=state.positions[model],dx=position.x-previous.x,dz=position.z-previous.z;
 state.positions[model]=position;
 if(dx*dx+dz*dz>KEEP_MOVING.distanceSquared)return false;
 const soundId=11+state.impactVoice;state.impactVoice=(state.impactVoice+1)%8;
 const point=r.collisionProbe??position;
 sim.emit('keepMoving',{runner:model,text:'Keep Moving Criminal',soundId,point:{x:f(point.x),y:f(point.y),z:f(point.z)}});
 r.health=healthAfterDelta(r.health,f(-KEEP_MOVING.damage*GAME_TABLES.runners[model].armorFactor),{profileType:0,shielded:r.shield>0,invulnerableHuman:!!sim.invulnerableHuman});
 if(r.health===0){r.pendingDeath={owner:model,weapon:'Laser',reason:'keepMoving'};r.killedByRunner=model;r.lastHitWeaponCode=4;sim.emit('selfKill',{runner:model,text:`${r.profileName??GAME_TABLES.runners[model].name.split(' ')[0]} died`})}
 // 457fb0 stores the scaled source before 458d88's float sin/cos and output.
 // Native yaw is a stored degree value; the world basis deliberately remains
 // from earlier in the callback until the following physical update.
 const component=f(KEEP_MOVING.diagonal*KEEP_MOVING.kickSpeed),angle=f(-f(r.yaw*180/Math.PI))*KEEP_MOVING.rotationPi/180,sine=f(Math.sin(angle)),cosine=f(Math.cos(angle));
 r.lateralSpeed=f(component*sine+component*cosine);r.localVerticalSpeed=0;r.speed=-f(component*cosine-component*sine);
 sim.emit('paletteFlash',{runner:model,frames:2});return true;
}
