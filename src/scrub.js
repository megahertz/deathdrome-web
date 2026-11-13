import {GAME_TABLES} from './game-tables.js';
const C=GAME_TABLES.scrub;
export class Scrub {
 constructor(){this.active=false;this.height=C.initialHeightScale;this.scale=1;this.finished=false}
 start(){this.active=true}
 step(dt){if(!this.active||this.finished)return;if(this.height<C.heightThreshold)this.height*=1+C.heightGrowth*dt;else{this.height=1;this.scale*=1-C.contractionRate*dt}if(this.scale<=C.finishScale)this.finished=true}
 reaches(r){if(!this.active)return false;if(this.finished)return true;if(r.y>C.maximumHeight*this.height)return false;
  // The supplied model consists of 32 instanced wedges. Its exact native
  // proximity volume remains to be measured; use the inner polygon here.
  let half=Math.PI/C.segments,angle=Math.atan2(r.z,r.x),local=((angle+half)%(2*half)+2*half)%(2*half)-half;
  let radius=C.innerRadius*this.scale*Math.cos(half)/Math.cos(local);
  return r.x*r.x+r.z*r.z>=radius*radius;
 }
}
