import {GAME_TABLES} from './game-tables.js';
export const BARRIER=GAME_TABLES.secondary.barrier;
const point=r=>({x:r.x,y:0,z:r.z});
export class BarrierTrails{
 constructor(){this.states=Array.from({length:8},(_,owner)=>({owner,active:false,held:false,armed:true,locked:false,generating:false,age:0,points:[],retract:0}))}
 get active(){return this.states.filter(s=>s.active)}
 reset(id){Object.assign(this.states[id],{active:false,held:false,armed:true,locked:false,generating:false,age:0,points:[],retract:0})}
 input(r,held){
  let s=this.states[r.id];s.held=!!held;
  if(!held){s.generating=false;if(!s.active){s.armed=true;s.locked=false}return false}
  let valid=r.y===0&&r.speed>0&&!r.dead&&!r.disrupted;
  if(!valid){s.generating=false;s.armed=false;return false}
  if(!s.active){
   if(s.locked)return false;if(!s.armed){s.armed=true;return false}
   Object.assign(s,{active:true,locked:true,generating:true,age:0,retract:0,points:[point(r),point(r)]});return true;
  }
  if(!s.generating)return false;
  s.points[s.points.length-1]=point(r);
  let a=s.points.at(-2),d2=(r.x-a.x)**2+(r.z-a.z)**2;
  if(d2>=BARRIER.segmentDistanceSquared){
   if(s.points.length-1>=BARRIER.segments)s.generating=false;
   else s.points.push(point(r));
  }
  return false;
 }
 step(dt){
  for(let s of this.active){
   s.age+=dt;
   if(s.age>=BARRIER.seconds){
    s.generating=false;s.retract++;
    if(s.retract>=s.points.length-1){s.active=false;if(!s.held){s.locked=false;s.armed=true}continue}
    // Native 436a00 collapses all earlier faces onto this endpoint.
    for(let i=0;i<s.retract;i++)s.points[i]={...s.points[s.retract]};
   }
  }
 }
 contacts(trail,r){
  if(r.id===trail.owner||r.dead||r.y>BARRIER.height*BARRIER.heightScale+BARRIER.verticalOffset||r.y+2<BARRIER.verticalOffset)return false;
  for(let i=1;i<trail.points.length;i++){
   let a=trail.points[i-1],b=trail.points[i],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;if(len<.000001)continue;
   let t=Math.max(0,Math.min(1,((r.x-a.x)*dx+(r.z-a.z)*dz)/len));
   if(Math.hypot(r.x-a.x-t*dx,r.z-a.z-t*dz)<2)return true;
  }
  return false;
 }
}
