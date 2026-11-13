import {GAME_TABLES} from './game-tables.js';
export const AI_OBSTACLES=GAME_TABLES.ai.obstacles;
export const heldAIRates=r=>({turn:r.turn,turnAcceleration:r.turnAcceleration,acceleration:r.acceleration});
const clock=sim=>sim.elapsed+GAME_TABLES.entrance.seconds-sim.countdown;

// Barrier faces use the same connected vertical rectangles as the visual trail.
// This is a ray/face test, without the provisional runner-contact radius.
export function barrierRayContacts(start,end,trails){
 let hits=[],dx=end.x-start.x,dz=end.z-start.z,dy=end.y-start.y,length=Math.hypot(dx,dy,dz),barrier=GAME_TABLES.secondary.barrier;
 for(let trail of trails){
  for(let i=1;i<trail.points.length;i++){
   let a=trail.points[i-1],b=trail.points[i],ex=b.x-a.x,ez=b.z-a.z,den=dx*ez-dz*ex;
   if(Math.abs(den)<1e-9)continue;
   let ax=a.x-start.x,az=a.z-start.z,t=(ax*ez-az*ex)/den,u=(ax*dz-az*dx)/den,y=start.y+t*dy;
   if(t>=0&&t<=1&&u>=0&&u<=1&&y>=barrier.verticalOffset&&y<=barrier.verticalOffset+barrier.height*barrier.heightScale){hits.push({kind:'barrier',owner:trail.owner,distance:t*length});break}
  }
 }
 return hits;
}

// Native 42d20c / 42c05b probe exactly 20 units along the full runner forward
// basis at +1.5Y. Each endpoint is a native float store; the end Y adds the
// lift to the unrounded position-plus-forward result, not the stored start Y.
export function probeAIForward(sim,r){
 let f=r.forwardVector||{x:-Math.sin(r.yaw),y:0,z:-Math.cos(r.yaw)},F=Math.fround,x=F(r.x),y=F(r.y),z=F(r.z),length=AI_OBSTACLES.probeLength,height=AI_OBSTACLES.probeHeight;
 let start={x,y:F(y+height),z},end={x:F(x+F(f.x)*length),y:F(y+F(f.y||0)*length+height),z:F(z+F(f.z)*length)};
 let hits=sim.sceneContacts?sim.sceneContacts(start,end,r):sim.lineBlocked(start,end)?[{kind:'wall'}]:[];
 hits=[...hits,...barrierRayContacts(start,end,sim.barrierTrails?.active||[])].sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity));
 if(hits.length)sim.emit('aiProbe',{runner:r.id,hits:hits.map(h=>({kind:h.kind,owner:h.owner,runner:h.runner}))});
 return hits;
}

export function requestAIBarrierJump(sim,r,{attack=false}={}){
 r.aiState.pendingJump=true;
 let random=sim.randomInt();
 // The path branch performs unsigned integer division, unlike the attack and
 // periodic jump schedules. Preserve this encoded distinction.
 let delay=attack?random*AI_OBSTACLES.attackJumpRandomScale*AI_OBSTACLES.attackJumpSeconds:Math.floor(random/AI_OBSTACLES.pathJumpDivisor)*AI_OBSTACLES.pathJumpSeconds;
 r.aiState.jumpAt=Math.fround(clock(sim)+delay);
}
