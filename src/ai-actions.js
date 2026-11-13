import {heldAIRates,probeAIForward,requestAIBarrierJump,barrierRayContacts} from './ai-obstacles.js';
import {GAME_TABLES} from './game-tables.js';
import {resetNavigation,beginRouteRecovery,pushRouteNode} from './ai-navigation.js';
import {WEAPON_NAMES,inventoryCells,appendWeapon} from './inventory.js';
export const AI_ACTIONS=GAME_TABLES.ai.actions;
export const AI_ATTACK=GAME_TABLES.ai.attack;
export const aiClock=sim=>sim.elapsed+GAME_TABLES.entrance.seconds-sim.countdown;
const fraction=sim=>sim.randomInt()*AI_ACTIONS.randomScale;
export const aiTargetActive=q=>!!q&&!q.dead&&!q.inactive&&!q.respawn&&!q.escaped&&!q.opponentExit;
export function resetAI(sim,r,options){
 const now=Math.fround(aiClock(sim));
 r.aiState={mode:'path',target:null,attackAfter:Math.fround(now+AI_ACTIONS.initialActionDelay),attackUntil:0,recoverUntil:0,shotAt:0,lockActive:false,previousDirection:{x:0,z:-1},
  enhancerAt:Math.fround(now+AI_ACTIONS.initialEnhancerDelay),jumpAt:Math.fround(now+AI_ACTIONS.initialActionDelay+fraction(sim)*AI_ACTIONS.jumpRandomSeconds),
  barrierAt:Math.fround(now+AI_ACTIONS.initialActionDelay+fraction(sim)*AI_ACTIONS.barrierRandomSeconds),barrierHeld:false};
 resetNavigation(sim,r,options);
}

// 42c9bc scans runner IDs in order, including other computer opponents. Its
// exclusion predicate uses abs(x)+abs(y), as encoded, rather than x/z radius.
export function acquireAITarget(sim,r,level){
 const f=Math.fround,origin={...r,x:f(r.x),y:f(r.y),z:f(r.z)},from={...origin,y:f(origin.y+AI_ACTIONS.rayHeight)};
 for(const q of [...sim.runners].sort((a,b)=>a.id-b.id)){
  if(!aiTargetActive(q))continue;
  const x=f(q.x),y=f(q.y),z=f(q.z);
  if(Math.abs(x)+Math.abs(y)<AI_ACTIONS.targetExclusionCoordinateSum||Math.abs(y-origin.y)>AI_ACTIONS.targetHeightBand||(x-origin.x)**2+(z-origin.z)**2>level.radiusSquared)continue;
  const to={...q,x,y:f(y+AI_ACTIONS.rayHeight),z};
  if(sim.sceneContacts){
   // 42caf2 requires one intersection whose node belongs to a runner. A
   // completely clear ray, wall hit or multiple hits rejects this candidate.
   const hits=[...sim.sceneContacts(from,to,r,q),...barrierRayContacts(from,to,sim.barrierTrails?.active??[])];
   if(hits.length===1&&hits[0].kind==='runner')return q;
  }else if(q.id!==r.id&&!sim.lineBlocked(from,to))return q;
 }
}


// 42db00 re-rolls ShockWave once and maps Nitro/Laser choices to Missile.
// 42db7c walks all four cells to avoid duplicates, skipping ShockWave on wrap.
export function rollAIEnhancer(sim){
 let id=sim.randomInt()%7;if(id===2)id=sim.randomInt()%7;
 if(![1,2,3,5,6].includes(id))id=1;
 return id;
}
export function chooseAIEnhancer(sim,r){
 let id=rollAIEnhancer(sim),cells=inventoryCells(r);while(cells.includes(id)){id=(id+1)%7;if(id===2)id=(id+1)%7}
 return WEAPON_NAMES[id];
}

export function stepAIActions(sim,r,level,{recovering=r.aiState.mode==='recover'}={}){
 let a=r.aiState,now=Math.fround(aiClock(sim)),jump=!!a.pendingJump,barrier=a.barrierHeld??false;a.pendingJump=false;
 // 42bda1: the recovery branch defers a due barrier start once, before the
 // common periodic actions, even if alignment returns to path this frame.
 if(recovering&&now>=a.barrierAt)a.barrierAt=Math.fround(a.barrierAt+AI_ACTIONS.barrierWindowSeconds);
 if(now>=a.jumpAt){jump||=a.mode==='path';a.jumpAt=Math.fround(now+fraction(sim)*AI_ACTIONS.jumpRandomSeconds)}
 // 42be37: barrierAt is the START of a four-second held interval. Before
 // that start the original issues no input call and preserves the held flag.
 if(now>=a.barrierAt){
  if(now<a.barrierAt+AI_ACTIONS.barrierWindowSeconds)barrier=true;
  else{barrier=false;a.barrierAt=Math.fround(now+AI_ACTIONS.barrierBaseSeconds+fraction(sim)*AI_ACTIONS.barrierRandomSeconds)}
 }
 a.barrierHeld=barrier;
 if(now>=a.enhancerAt){let weapon=chooseAIEnhancer(sim,r);if(appendWeapon(r,weapon).added)sim.emit('aiEnhancer',{runner:r.id,weapon});a.enhancerAt=Math.fround(now+fraction(sim)*level.enhancerSeconds)}
 return {jump,barrier};
}

function recoverAttack(sim,r){
 let a=r.aiState;a.mode='recover';a.target=null;a.recoverUntil=Math.fround(Math.fround(aiClock(sim))+AI_ACTIONS.recoverySeconds);
 if(r.navigation)beginRouteRecovery(sim,r);
}
export function stepAITarget(sim,r,level,{branch=r.aiState.mode,targetChecked=false}={}){
 let a=r.aiState,now=Math.fround(aiClock(sim)),acquire=branch==='path';
 // 42bd41 stays in the dispatched attack branch after its action changes
 // mode. Loss/contact recovery and expiry can both push a route this frame.
 if(branch==='attack'){
  if(!targetChecked&&!aiTargetActive(sim.runners[a.target]))recoverAttack(sim,r);
  if(now>=a.attackUntil)recoverAttack(sim,r);
 }
 if(!r.navigation&&a.mode==='recover'&&now>=a.recoverUntil){a.mode='path';acquire=true}
 if(acquire&&now>a.attackAfter){let q=acquireAITarget(sim,r,level);if(q){a.mode='attack';a.target=q.id;a.shotAt=now;a.attackUntil=a.attackAfter=Math.fround(now+level.attackSeconds);if(r.navigation)r.navigation.attackCollisions=0;pushRouteNode(sim,r,{next:true});sim.emit('aiAttack',{runner:r.id,target:q.id})}}
 return a.mode==='attack'?sim.runners[a.target]:null;
}

// 42c251 adds a target-direction change term to its planar steering error.
// These are rates assigned by AI, rather than simulated human button presses.
export function stepAIAttack(sim,r,target,level){
 if(!aiTargetActive(target)){recoverAttack(sim,r);return heldAIRates(r)}
 let contact=r.aiContact||{clear:false};
 if(!contact.clear){
  if(contact.wall&&r.navigation&&++r.navigation.attackCollisions>10)beginRouteRecovery(sim,r);
  return heldAIRates(r);
 }
 let hits=probeAIForward(sim,r);
 if(hits.length){
  let barrier=hits.find(h=>h.kind==='barrier');
  if(barrier&&level.barrierJumpEnabled){if(barrier.owner!==r.id)requestAIBarrierJump(sim,r,{attack:true})}
  else r.turn=Math.sign(r.turn)*GAME_TABLES.runners[r.id].maxTurnDegrees*Math.PI/180;
  return heldAIRates(r);
 }
 if(r.navigation&&aiClock(sim)>=r.navigation.refreshAt)pushRouteNode(sim,r);
 let a=r.aiState,x=target.x-r.x,z=target.z-r.z,distanceSquared=x*x+z*z,length=Math.sqrt(distanceSquared);
 let direction=length?{x:x/length,z:z/length}:{x:0,z:0},forward={x:-Math.sin(r.yaw),z:-Math.cos(r.yaw)},previous=a.previousDirection;
 let cross=direction.x*forward.z-forward.x*direction.z,change=previous.x*direction.z-previous.z*direction.x;
 let turn=(cross+change)*GAME_TABLES.runners[r.id].maxTurnDegrees*Math.PI/180;
 a.previousDirection=direction;
 let acceleration=r.acceleration;
 if(Math.abs(target.speed)<AI_ATTACK.slowTargetSpeed){
  if(distanceSquared<AI_ATTACK.maximumShotDistanceSquared&&Math.abs(cross)>AI_ATTACK.brakeAlignmentCross)acceleration=0;
  else if(distanceSquared<AI_ATTACK.reverseDistanceSquared)acceleration=-100;
 }else acceleration=100;
 let alignment=direction.x*forward.x+direction.z*forward.z,now=aiClock(sim);
 // 42c3c5: only a newly acquired lock defers firing. Blocked/contact early
 // returns above leave this latch and deadline untouched.
 if(r.missileLockTarget!=null){if(!a.lockActive)a.shotAt=Math.fround(now+AI_ATTACK.missileDelay);a.lockActive=true}else a.lockActive=false;
 if(now>a.shotAt&&level.shootEnabled&&alignment>AI_ATTACK.shotAlignment&&distanceSquared>AI_ATTACK.minimumShotDistanceSquared&&distanceSquared<AI_ATTACK.maximumShotDistanceSquared){
  if(r.weapon)sim.secondary(r);else sim.fire(r);
  // Native fires the current slot, resets to laser, then cycles once. The
  // additional missile delay depends on the newly selected slot.
  r.selectedWeapon=0;sim.selectWeapon(r);sim.cycleWeapon(r);
  a.shotAt=Math.fround(now+level.shotSeconds);
  if(r.weapon==='Missile')a.shotAt=Math.fround(a.shotAt+AI_ATTACK.missileDelay);
 }
 return {turn,turnAcceleration:AI_ATTACK.turnAccelerationDegrees*Math.PI/180,acceleration};
}
