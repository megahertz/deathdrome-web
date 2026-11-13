import {GAME_TABLES} from './game-tables.js';

// EKEY.C, functions 43e014 / 43de04 / 43df44 / 43e324. Paths retain
// the original DXF vertex order. Collision radius still needs measurement.
export class RechargeOrbs {
 constructor({arena=1,round=1,paths=[],ground=()=>0}={}) {
  this.paths=paths;this.ground=ground;this.settings=GAME_TABLES.recharge.rounds[arena-1][round-1];
  this.nextPath=0;this.nextVertex=0;
  this.orbs=paths.length?Array.from({length:this.settings.count},(_,id)=>({id,cooldown:0,path:-1,vertex:0,x:0,y:0,z:0})):[];
  for(let orb of this.orbs)this.place(orb);
 }
 place(orb) {
  let occupied=new Set(this.orbs.filter(o=>o!==orb&&o.cooldown<=0).map(o=>o.path));
  let path=this.nextPath;
  for(let tries=0;occupied.has(path)&&tries<this.paths.length;tries++)path=(path+1)%this.paths.length;
  orb.path=path;orb.vertex=this.nextVertex++%this.paths[path].length;orb.cooldown=0;
  let [x,,z]=this.paths[path][orb.vertex];orb.x=x;orb.z=z;orb.y=this.ground(x,z,200);
  this.nextPath=(path+1)%this.paths.length;
 }
 step(dt) {
  for(let orb of this.orbs){
   if(orb.cooldown>0){orb.cooldown-=dt;if(orb.cooldown<=0)this.place(orb);continue}
   let route=this.paths[orb.path],remaining=dt*this.settings.speed;
   while(remaining>0){
    let next=(orb.vertex+1)%route.length,[x,,z]=route[next],length=Math.hypot(x-orb.x,z-orb.z);
    if(length<=remaining){orb.x=x;orb.z=z;orb.vertex=next;remaining-=length;if(length===0)break}
    else{orb.x+=(x-orb.x)*remaining/length;orb.z+=(z-orb.z)*remaining/length;remaining=0}
   }
   orb.y=this.ground(orb.x,orb.z,200);
  }
 }
 collect(orb){orb.cooldown=GAME_TABLES.recharge.respawnSeconds}
}
