// Visual-only policy and state: never consumes the simulation RNG or changes runners.
export class AdaptiveResolution{
 constructor(){this.reset()}
 reset(){this.factor=1;this.elapsed=0;this.slow=0;this.fast=0;this.cooldown=0;this.average=1/60}
 sample(dt,active=true){
  if(!active||!Number.isFinite(dt)||dt<=0||dt>.1)return this.factor;
  this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.average+=(dt-this.average)*.08;
  if(this.elapsed<2)return this.factor; // Ignore shader compilation and entry transitions.
  this.slow=this.average>1/43?this.slow+dt:0;
  this.fast=this.average<1/57?this.fast+dt:0;
  if(!this.cooldown&&this.slow>1){this.factor=Math.max(.4,this.factor-.15);this.cooldown=2;this.slow=this.fast=0}
  else if(!this.cooldown&&this.fast>6){this.factor=Math.min(1,this.factor+.1);this.cooldown=3;this.slow=this.fast=0}
  return this.factor;
 }
}
export const FOG_PROFILES=Object.freeze([
 [0x0b1118,.0009],[0x080d18,.0008],[0x111418,.00085],[0x101118,.0009],
 [0x1a0e0b,.001],[0x0b1416,.00085],[0x12110d,.0009],[0x160d15,.0009]
]);
export function contactShadowPose(r,supports){
 if(r.dead||r.inactive)return null;
 const floor=supports.filter(p=>p.height<=r.y+.4&&Math.abs(p.normal?.y||0)>.35).sort((a,b)=>b.height-a.height)[0];
 if(!floor)return null;const height=Math.max(0,r.y-floor.height);if(height>55)return null;
 return {x:r.x,y:floor.height+.035,z:r.z,normal:floor.normal,yaw:r.yaw||0,scale:1+Math.min(30,height)*.035,opacity:.28/(1+height*.11)};
}
export class VisualParticles{
 constructor(capacity=384){this.capacity=capacity;this.items=[];this.seed=0x62731945}
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296}
 clear(){this.items.length=0}
 add(position,{color=[1,.55,.12],life=.4,size=.16,speed=6,smoke=false,trail=false}={}){
  if(this.items.length>=this.capacity)this.items.shift();
  const angle=this.random()*Math.PI*2,horizontal=trail?0:this.random()*speed;
  this.items.push({x:position.x,y:position.y,z:position.z,vx:Math.cos(angle)*horizontal,vy:trail?0:(smoke?1+this.random()*2:1+this.random()*speed),vz:Math.sin(angle)*horizontal,age:0,life,size,color:color.slice(),smoke,trail});
 }
 burst(position,large=false){
  for(let i=0;i<(large?30:9);i++)this.add(position,{life:.2+this.random()*.5,speed:large?14:7,size:large?.2:.12});
  if(large)for(let i=0;i<12;i++)this.add(position,{color:[.22,.24,.26],life:1.2+this.random(),speed:3,size:1.2+this.random()*1.4,smoke:true});
 }
 step(dt){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
  this.items=this.items.filter(p=>{p.age+=dt;if(p.age>=p.life)return false;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(!p.smoke&&!p.trail)p.vy-=12*dt;return true});
 }
}
