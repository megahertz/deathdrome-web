import {disableControls} from './drive.js';
import {GAME_TABLES} from './game-tables.js';
export const SECONDARY=GAME_TABLES.secondary;
const forward=r=>({x:-Math.sin(r.yaw),z:-Math.cos(r.yaw)});
const dot=(r,q)=>{let f=forward(r);return (q.x-r.x)*f.x+(q.z-r.z)*f.z};

// Native per-runner objects: a second Disruptor is rejected, but attempting a
// second active ShockWave still consumes that inventory slot (4375b5/440530).
export function launchSecondary(sim,r,weapon){
 const active=kind=>sim.projectiles.some(p=>p.owner===r.id&&p.kind===kind&&p.life>0);
 if(weapon==='ShockWave'){
  if(!active(weapon))sim.projectiles.push({kind:weapon,owner:r.id,x:r.x,y:r.y,z:r.z,scale:1,life:SECONDARY.shockWave.seconds});
 }else if(weapon==='Disruptor'){
  if(active(weapon))return false;
  let f=forward(r),c=SECONDARY.disruptor;
  sim.projectiles.push({kind:weapon,owner:r.id,x:r.x+f.x*c.launchDistance,y:r.y,z:r.z+f.z*c.launchDistance,dx:f.x,dz:f.z,speed:c.baseSpeed+Math.max(0,r.speed),scale:1,rotation:0,life:c.seconds});
 }else if(weapon==='Ion Sword'){
  r.ionSeconds=SECONDARY.ionSword.seconds;r.ionTarget=null;
 }
 return true;
}

export function acquireIonTarget(sim,r){
 let c=SECONDARY.ionSword,best=-1,target=null;
 for(let q of sim.runners){
  if(q.id===r.id||q.dead||q.health<=0||Math.abs(q.y-r.y)>=c.verticalBand)continue;
  let d2=(q.x-r.x)**2+(q.z-r.z)**2,projection=dot(r,q);
  if(projection<=c.acquireDot||d2>=c.rangeSquared)continue;
  let score=projection/d2;if(score>best){best=score;target=q.id}
 }
 return target;
}

export function stepIon(sim,r,dt){
 if(!r.ionSeconds||r.dead)return;
 r.ionSeconds=Math.max(0,r.ionSeconds-dt);
 if(!r.ionSeconds){r.ionTarget=null;return}
 if(r.ionTarget==null)r.ionTarget=acquireIonTarget(sim,r);
 let q=sim.runners[r.ionTarget];if(!q)return;
 // Range and height only constrain acquisition in the original; a retained
// target is released on death or when it passes behind the runner.
 if(q.dead||q.health<=0||dot(r,q)<=SECONDARY.ionSword.retainDot){r.ionTarget=null;return}
 sim.damage(q,SECONDARY.ionSword.damagePerSecond*dt,r.id,'Ion Sword',{armor:false,continuous:true});
 if(q.health===0){if(r.id===sim.player)sim.addScore(SECONDARY.ionSword.killScore);r.ionTarget=null}
}

export function stepSecondaryProjectile(sim,p,dt){
 p.life-=dt;if(p.life<=0)return;
 if(p.kind==='ShockWave'){
  let c=SECONDARY.shockWave;p.scale=Math.min(c.maximumScale,p.scale+c.growth*dt);
  for(let q of sim.runners){
   if(q.id===p.owner||q.dead||Math.abs(q.y-p.y)>=c.verticalBand)continue;
   // The mesh is a filled regular dodecagon. Runner extent remains provisional.
   let angle=Math.atan2(q.z-p.z,q.x-p.x),sector=Math.PI/6;
   let edge=c.radius*p.scale*Math.cos(Math.PI/12)/Math.cos(((angle+Math.PI/12)%sector+sector)%sector-Math.PI/12);
   if(Math.hypot(q.x-p.x,q.z-p.z)>edge+2)continue;
   sim.damage(q,c.damage,p.owner,p.kind,{armor:false,power:false,repeatLethal:true});
   if(p.owner===sim.player)sim.addScore(c.contactScore);
  }
 }else if(p.kind==='Disruptor'){
  let c=SECONDARY.disruptor;p.scale+=c.growth*dt;p.x+=p.dx*p.speed*dt;p.z+=p.dz*p.speed*dt;p.rotation+=c.degreesPerUpdate*Math.PI/180;
  for(let q of sim.runners){
   if(q.id===p.owner||q.dead||q.shield>0||q.controlsEnabled===false)continue;
   if(Math.hypot(q.x-p.x,q.z-p.z)>c.radius*p.scale+2||q.y+2<p.y||q.y>p.y+c.height*p.scale)continue;
   disableControls(q,c.disabledSeconds);sim.emit('disrupted',{runner:q.id,owner:p.owner});
   if(p.owner===sim.player)sim.addScore(c.contactScore);
  }
 }
}
