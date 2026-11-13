import {clearRouteNodes} from './ai-navigation.js';
import {GAME_TABLES} from './game-tables.js';
export const RESPAWN=GAME_TABLES.respawn;
export const runnerBodyVisible=r=>!r.dead||!!r.respawn?.bodyVisible||!!r.opponentExit;
export function cancelRespawn(sim,r){if(r.respawn?.routeIndex!=null)sim.aiRouteCounts[r.respawn.routeIndex]--;r.respawn=null}

// 433c88 positions the inactive runner, then the shroud node's actions run
// 42b2cc (delay) and 42b180 (energize). Physics/control reset occurs at the end.
export function beginRespawn(sim,r,{routeIndex=null,goalColor=null,allocateRoute=true}={}){
 cancelRespawn(sim,r);if(r.navigation?.routeIndex!=null)sim.aiRouteCounts[r.navigation.routeIndex]--;clearRouteNodes(sim,r);r.navigation=null;
 let pose=sim.spawnPose(r.id);
 Object.assign(r,pose,{inactive:false,dead:Infinity,speed:0,lateralSpeed:0,vy:0,turn:0,acceleration:0,turnAcceleration:0});
 r.floor=sim.ground(r.x,r.z,r.y+8);
 r.respawn={phase:'delay',elapsed:0,bodyVisible:false,shroudVisible:false,routeIndex,goalColor,allocateRoute,born:sim.elapsed};
 if(routeIndex!=null)sim.aiRouteCounts[routeIndex]++;
 sim.emit('respawnStarted',{runner:r.id});return r.respawn;
}

export function stepRespawn(sim,r,dt){
 let state=r.respawn;if(!state)return false;
 state.elapsed=Math.fround(state.elapsed+Math.fround(dt));
 if(state.phase==='delay'){
  if(state.elapsed>RESPAWN.delaySeconds){state.phase='energize';state.elapsed=0;state.shroudVisible=true;sim.emit('respawnEnergize',{runner:r.id})}
 }else if(state.elapsed>=RESPAWN.energizeSeconds){
  // Release the pending reservation; native setup receives the route already
  // chosen by the death-replacement action, rather than allocating another.
  sim.spawn(r,{routeIndex:state.allocateRoute?state.routeIndex??undefined:state.routeIndex,goalColor:state.goalColor});
  sim.emit('respawnComplete',{runner:r.id});
 }else if(state.elapsed>=RESPAWN.bodyAtSeconds&&!state.bodyVisible){state.bodyVisible=true;sim.emit('respawnBody',{runner:r.id})}
 return true;
}
