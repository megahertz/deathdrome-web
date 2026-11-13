import {GAME_TABLES} from './game-tables.js';
import {aiClock} from './ai-actions.js';
export const OUTSIDE_REGION_SECONDS=1;

// 433632..43367b runs only for a human profile, before the normal zero-health
// destruction check. This direct health setter bypasses damage protection.
export function checkRegionHealth(sim,r){
 if(r.id!==sim.player)return false;
 if((r.zoneMask??-1)!==0){r.outsideRegionUntil=0;return false}
 const now=Math.fround(aiClock(sim));
 if(!r.outsideRegionUntil){r.outsideRegionUntil=Math.fround(now+OUTSIDE_REGION_SECONDS);return false}
 if(now<=r.outsideRegionUntil)return false;
 r.health=0;
 const name=r.profileName??GAME_TABLES.runners[r.id].name.split(' ')[0];
 sim.emit('returnToDomain',{runner:r.id,text:`Return to Domain ${name}`});return true;
}
