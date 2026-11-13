import {GAME_TABLES} from './game-tables.js';
import {hotSpotMarkers,hotSpotBox} from './hot-spot-geometry.js';
import {intersectBox} from './scene-boxes.js';
import {segmentInWorldPartition} from './world-partition.js';
export const HOT_SPOT=GAME_TABLES.hotSpots;
export class HotSpots{
 constructor(markers=[],onChange=()=>{}){
  this.onChange=onChange;let armedSeconds=1;
  this.spots=hotSpotMarkers(markers).map((m,id)=>{const armed=m.name==='activ_hs.gam',seconds=armed?armedSeconds:0;if(armed)armedSeconds=Math.fround(armedSeconds+.4);return {id,x:m.position[0],y:m.position[1],z:m.position[2],matrix:m.matrix,box:hotSpotBox(m),alwaysArmed:armed,phase:armed?1:0,seconds,scale:1,color:[1,0,0],owner:null}});
 }
 trigger(spot,owner){
  spot.owner=owner;
  if(spot.phase===0){spot.phase=1;spot.seconds=2;this.onChange(spot);return 'armed'}
  if(spot.phase!==1)return null;
  if(this.spots.filter(s=>s.phase>=2).length>=HOT_SPOT.maximumEruptions){spot.seconds=2;return null}
  Object.assign(spot,{phase:2,seconds:HOT_SPOT.flashSeconds,scale:1,color:[1,0,0]});this.onChange(spot);return 'erupting';
 }
 step(dt){
  for(let s of this.spots){
   if(s.phase<2)continue;const oldPhase=s.phase;s.seconds-=dt;
   if(s.phase===2){
    if(s.seconds<=0){s.phase=3;s.seconds=HOT_SPOT.growthSeconds;s.color=[1,1,1]}
    else{s.color=[1,1-s.seconds/HOT_SPOT.flashSeconds,1-s.seconds/HOT_SPOT.flashSeconds]}
   }else if(s.phase===3){
    if(s.seconds<=0){s.phase=4;s.seconds=0}
    else s.scale=Math.min(HOT_SPOT.maximumScale,s.scale+HOT_SPOT.growthDistance/HOT_SPOT.growthSeconds*dt);
   }else{Object.assign(s,{phase:s.alwaysArmed?1:0,seconds:s.alwaysArmed?2:0,scale:1,color:[1,0,0]})}
   if(s.phase!==oldPhase)this.onChange(s);
  }
 }
 markerContact(s,r){return !r.dead&&s.phase<2&&Math.abs(r.x-s.x)<3.5&&Math.abs(r.z-s.z)<3.5&&r.y<s.y+2.25&&r.y+2>s.y}
 forceContact(s,r){return !r.dead&&s.phase>=2&&Math.abs(r.y-s.y-HOT_SPOT.forceHeight)<=HOT_SPOT.verticalBand&&Math.hypot(r.x-s.x,r.z-s.z)<HOT_SPOT.forceRadius*s.scale+2}
 projectileContact(s,a,b){
  if(s.phase>=2)return false;
  return segmentInWorldPartition(s.box,a,b)&&!!intersectBox(s.box,a,b);
 }
}
