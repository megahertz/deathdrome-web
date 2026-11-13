import {GAME_TABLES} from './game-tables.js';
export const VERTICAL=GAME_TABLES.vertical;
// Legacy isolated airborne diagnostic. Production uses suspension.js, which
// includes the real 4301ac spring/contact response and three support points.
export function updateVertical(r,floor,dt,jump=false){
 let didJump=jump&&!r.jumpHeld&&r.y<=floor+.1;
 if(didJump)r.vy+=VERTICAL.jumpImpulse;
 r.jumpHeld=!!jump;
 let next=r.y+r.vy*dt;
 if(next-VERTICAL.gravity*dt*dt>floor){r.y=next;r.vy-=VERTICAL.gravity*dt}
 else{r.y=floor;r.vy=0}
 if(r.y>VERTICAL.ceiling){r.y=VERTICAL.ceiling;r.vy=-Math.abs(r.vy)}
 return didJump;
}
