import {consumeWeapon} from './inventory.js';
import {GAME_TABLES} from './game-tables.js';
import {emitterOrigins,projectileForward} from './weapon-emitters.js';
export const PROJECTILE=GAME_TABLES.combat;
export const weaponId=r=>PROJECTILE.weaponIds[r.weapon??'Laser'];
export function projectileSlots(sim,r){
 const active=sim.projectiles.filter(p=>p.owner===r.id&&(p.kind==='Missile'||p.kind==='Laser')&&p.life>0),used=new Set(active.filter(p=>p.slot!=null).map(p=>p.slot));
 // Controlled fixtures from older diagnostics may omit slot IDs.
 for(let p of active)if(p.slot==null){let slot=0;while(used.has(slot))slot++;p.slot=slot;used.add(slot)}
 return active.sort((a,b)=>a.slot-b.slot);
}
// 43781c hides the pool without releasing its active flags. Inactive actors
// stop visiting the weapon wrapper; 4356f4 clears the pool during setup.
export function hideRunnerProjectiles(sim,r){
 for(const p of projectileSlots(sim,r))p.hidden=true;
}
export function resetRunnerProjectiles(sim,r){
 sim.projectiles=sim.projectiles.filter(p=>p.owner!==r.id||(p.kind!=='Laser'&&p.kind!=='Missile'));
}
export function missileTarget(r,runners,previous=null){
 const f=Math.fround,forward=r.planarForwardVector??{x:f(-Math.sin(r.yaw)),z:f(-Math.cos(r.yaw))};
 let best=-1,target=previous,dx=f(forward.x),dz=f(forward.z);
 for(let q of [...runners].sort((a,b)=>a.id-b.id)){if(q.id===r.id||q.dead||q.inactive||q.respawn||q.escaped||q.opponentExit||!((r.zoneMask??-1)&(q.zoneMask??-1)))continue;let rawX=f(q.x)-f(r.x),rawZ=f(q.z)-f(r.z),x=f(rawX),z=f(rawZ),d2=f(x*x+z*z),dot=rawX*dx+rawZ*dz;
  if(d2>=PROJECTILE.missileLockDistanceSquared||dot<=PROJECTILE.missileLockDot)continue;
  // x87 compares the extended score with the previously float-stored best.
  // Equal geometric scores can therefore choose the later model ID.
  let alignment=(z/d2)*dz+(x/d2)*dx;if(alignment>best){best=f(alignment);target=q.id}
 }
 return target;
}
export function updateMissileLock(sim,r){
 // Dispatch table 437520 identifies 0 as Nitro and 4 as Laser.
 if(weaponId(r)!==0&&weaponId(r)!==1)return r.missileLockTarget??null;
 const active=sim.projectiles.some(p=>p.owner===r.id&&p.kind==='Missile'&&p.life>0);
 r.missileLockTarget=missileTarget(r,sim.runners,active?r.missileLockTarget??null:null);
 return r.missileLockTarget;
}
// 435974 reserves flags/descriptors only. Pose, muzzle and inventory belong
// to the first 4359e4/436634 action, after the wrapper's lock scan.
export function queueProjectiles(sim,r,missile=false){
 if(r.dead||r.controlsEnabled===false)return false;
 const active=projectileSlots(sim,r),used=new Set(active.map(p=>p.slot)),available=PROJECTILE.projectileSlots-active.length;
 if(available<=0)return false;
 const n=Math.min(available,missile?1:PROJECTILE.laserPerPress),seconds=missile?PROJECTILE.missileSeconds:PROJECTILE.laserSeconds;
 for(let i=0;i<n;i++){
  let slot=0;while(used.has(slot))slot++;used.add(slot);
  sim.projectiles.push({slot,weaponId:missile?1:4,owner:r.id,kind:missile?'Missile':'Laser',pending:true,damage:missile?PROJECTILE.missileDamage:PROJECTILE.laserDamage,age:0,lifetime:seconds,life:seconds});
 }
 return true;
}
export function initializeProjectile(sim,r,p,{consume=true}={}){
 const missile=p.kind==='Missile',side=r.muzzleSide??0,forward=projectileForward(r);
 // The original consumes the currently selected cell, even if it changed
 // after allocation. Consumption resets selection but retains the shared lock.
 if(missile&&consume)consumeWeapon(r);
 const origin=missile?{x:Math.fround(r.x+forward.x*PROJECTILE.missileLaunchDistance),y:Math.fround(r.y+forward.y*PROJECTILE.missileLaunchDistance),z:Math.fround(r.z+forward.z*PROJECTILE.missileLaunchDistance)}:emitterOrigins(r,r.id===sim.player)[side?0:1];
 if(!missile)r.muzzleSide=1-side;
 const speed=Math.fround(missile?PROJECTILE.missileBaseSpeed+Math.fround(r.speed):PROJECTILE.laserBaseSpeed+Math.max(0,Math.fround(r.speed)));
 Object.assign(p,origin,{pending:false,hidden:false,dx:forward.x,dy:forward.y,dz:forward.z,vx:Math.fround(forward.x*speed),vy:Math.fround(forward.y*speed),vz:Math.fround(forward.z*speed),angles:{pitch:Math.fround(r.chassisPitchDegrees??0),yaw:Math.fround(r.yaw*180/Math.PI),roll:0},speed,target:missile?r.missileLockTarget??null:null});
 if(missile||side===1)sim.emit('shot',{runner:r.id,missile,count:missile?1:2,soundId:missile?9:2});
}
// Component-audit convenience: allocate and initialize without inventory writes.
// The game uses queueProjectiles and the ordered slot wrapper below.
export function launchProjectiles(sim,r,missile=false){
 const previous=new Set(sim.projectiles);
 if(!queueProjectiles(sim,r,missile))return false;
 if(missile)updateMissileLock(sim,r);
 for(const p of projectileSlots(sim,r))if(!previous.has(p))initializeProjectile(sim,r,p,{consume:false});
 return true;
}
export function stepRunnerProjectiles(sim,r,dt,contact=()=>{},{finalActor=false}={}){
 if(!finalActor&&(r.dead||r.inactive||r.respawn))return;
 // The actor checks active status only on entry. An exit handoff may disable
 // it during physics, but that same callback still completes its weapons.
 if(finalActor||!r.dead&&!r.respawn&&!r.opponentExit&&!r.escaped)updateMissileLock(sim,r);
 for(let p of projectileSlots(sim,r)){
  if(p.pending)initializeProjectile(sim,r,p);
  if(p.kind==='Missile')p.target=r.missileLockTarget??null;
  if(p.target!=null&&(p.age??0)>0)steerMissile(p,sim.runners[p.target],dt);
  let old=stepProjectileMotion(p,dt);if(p.life>0)contact(p,old);
  if(p.life<=0)r.missileLockTarget=null;
 }
}
export function stepProjectileMotion(p,dt){
 const f=Math.fround,step=f(dt),old={x:p.x,y:p.y,z:p.z};
 p.lifetime??=p.kind==='Missile'?PROJECTILE.missileSeconds:PROJECTILE.laserSeconds;p.age??=f(p.lifetime-p.life);
 p.vx??=f(p.dx*p.speed);p.vy??=f((p.dy||0)*p.speed);p.vz??=f(p.dz*p.speed);
 p.x=f(p.x+p.vx*step);p.y=f(p.y+p.vy*step);p.z=f(p.z+p.vz*step);p.age=f(p.age+step);p.life=Math.max(0,p.lifetime-p.age);
 // Original 435d68 rejects the projectile outside the vertical domain band.
 if(p.y<0||p.y>64)p.life=0;
 return old;
}
export function steerMissile(p,target,dt){
 if(!target)return;
 const f=Math.fround,pi=PROJECTILE.emitters.rotationPi,scale=PROJECTILE.missileDegreesScale,rate=f(f(dt)*PROJECTILE.missileSteerDegrees);
 const norm=(a,b)=>{let length=f(Math.sqrt(a*a+b*b));if(!length)return [a,b];let inverse=f(1/length);return [f(a*inverse),f(b*inverse)]};
 const trig=degrees=>{let a=f(degrees)*pi/180;return [f(Math.cos(a)),f(Math.sin(a))]};
 const rotateY=(v,degrees)=>{let [c,s]=trig(degrees);return [f(v[0]*c+v[2]*s),v[1],f(v[2]*c-v[0]*s)]};
 const speed=p.speed??1,v=[p.vx??f(p.dx*speed),p.vy??f((p.dy||0)*speed),p.vz??f(p.dz*speed)],d=[f(f(target.x)-f(p.x)),f(f(target.y)-f(p.y)),f(f(target.z)-f(p.z))];
 const [tx,tz]=norm(d[0],d[2]),[perpZ,perpX]=norm(v[2],-v[0]),heading=f(Math.atan2(v[0],-v[2])*scale),yawDelta=f((perpX*tz+perpZ*tx)*rate);
 // The original skips writing its local vector at exactly zero heading. Use
 // the incoming vector there; native stack-dependent behavior is unresolved.
 const local=heading?rotateY(v,heading):v,targetHeading=f(Math.atan2(d[0],-d[2])*scale),aim=targetHeading?rotateY(d,targetHeading):d;
 const [ay,az]=norm(aim[1],aim[2]),[py,pz]=norm(-local[2],local[1]),pitchDelta=f((py*ay+pz*az)*rate);
 // Original 456a6c / 45673c compose a float-stored Y then X matrix.
 const [cy,sy]=trig(f(yawDelta-heading)),[cx,sx]=trig(pitchDelta),m=[cy,0,-sy,f(sy*sx),cx,f(cy*sx),f(sy*cx),-sx,f(cy*cx)];
 [p.vx,p.vy,p.vz]=[0,1,2].map(i=>f((local[0]*m[i]+local[1]*m[3+i])+local[2]*m[6+i]));
 if(p.angles){p.angles.pitch=f(p.angles.pitch+pitchDelta);p.angles.yaw=f(p.angles.yaw+yawDelta)}
 p.dx=p.vx/speed;p.dy=p.vy/speed;p.dz=p.vz/speed;p.steering={yawDelta,pitchDelta};
}
