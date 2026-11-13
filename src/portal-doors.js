import {GAME_TABLES} from './game-tables.js';
const f=Math.fround;
export const PORTAL=GAME_TABLES.portals;
export function portalLocked(id,round){return PORTAL.locked[Number(id[0])]?.[round-1]??true}
export class PortalDoors{
 constructor(round=1,update=()=>{}){this.round=round;this.update=update;this.doors=new Map()}
 touch(id,runner,dt){
  if(portalLocked(id,this.round)||runner.dead||dt<=0)return false;
  let door=this.doors.get(id);if(!door){door={id,height:0};this.doors.set(id,door)}
  door.height=Math.min(PORTAL.maximumLift,f(door.height+PORTAL.raiseSpeed*f(dt)));this.update(id,door.height);return true;
 }
 step(dt){for(let door of this.doors.values()){
  door.height=Math.max(0,f(door.height-f(dt)*(door.height<PORTAL.topThreshold?PORTAL.lowerSpeed:PORTAL.topLowerSpeed)));this.update(door.id,door.height);
 }}
}
