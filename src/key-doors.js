// Secret door actions 4408c0 / 440998. Stored timer, displacement and height
// use float32. The rising branch deliberately permits one-step overshoot;
// exactly four seconds does not write a translation. Zero expires next tick.
const f=Math.fround;
export function stepKeyDoor(door,seconds){
 if(!door.callback||!door.enabled)return false;
 const dt=f(seconds),delta=f(dt*3);door.remaining=f(door.remaining-dt);
 let moved=false;
 if(door.remaining<4){
  if(door.height>0)door.height=f(door.height-delta);
  if(door.height<0)door.height=0;
  moved=true;
 }else if(door.remaining>4&&door.height<10){door.height=f(door.height+delta);moved=true}
 if(door.remaining<0){door.remaining=0;door.callback=false}
 return moved;
}
export class KeyDoors {
 constructor(update=()=>{}){this.update=update;this.override=false;this.doors=Object.fromEntries(['x','y','z'].map(k=>[k,{height:0,remaining:0,callback:false,enabled:true,touchEnabled:true}]))}
 touch(key,runner){let door=this.doors[key];if(!door?.touchEnabled||(!this.override&&!runner.keyring?.[key]))return false;door.remaining=8;door.callback=true;return true}
 step(dt){for(let [key,d] of Object.entries(this.doors))if(stepKeyDoor(d,dt))this.update(key,d.height)}
}
