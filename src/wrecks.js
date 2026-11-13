import {GAME_TABLES} from './game-tables.js';
export const WRECK=GAME_TABLES.wreck;

// Native 43efcc reuses one destroyed model per runner. Respawning the live
// runner does not move or remove that model. A subsequent death replaces it.
export class Wrecks {
 constructor(){this.states=Array(8).fill(null)}
 create(r,seconds,ground){
  const spec=WRECK.runners[r.id];
  return this.states[r.id]={runner:r.id,x:r.x,y:ground(r.x,r.z,r.y+5),z:r.z,yaw:r.yaw,born:seconds,seconds:0,settled:false,
   body:{visible:false,hit:false,x:0,z:0,vx:WRECK.bodyVelocity[0],vz:WRECK.bodyVelocity[1]},
   parts:spec.parts.map(p=>({name:p.name,x:0,y:0,z:0,rx:0,rz:0,horizontal:WRECK.horizontalVelocity,vertical:WRECK.verticalVelocity,scale:1,visible:true}))};
 }
 step(dt,ground,random){
  for(let w of this.states){if(!w||w.settled)continue;
   let old=w.seconds;w.seconds+=dt;let moving=false,shrinking=false;
   for(let [i,p] of w.parts.entries()){
    if(!p.visible)continue;let spec=WRECK.runners[w.runner].parts[i],angle=spec.angleDegrees*Math.PI/180;
    let dx=0,dz=0,rx=0,rz=0;
    // 43eb50 uses half-gravity for both displacement and velocity updates.
    if(p.horizontal>0){let x=p.horizontal*Math.sin(angle)*dt,z=p.horizontal*Math.cos(angle)*(1-spec.verticalFactor)*dt;dx=x-WRECK.horizontalDeceleration*dt*dt;dz=z-WRECK.horizontalDeceleration*dt*dt;rx=z*WRECK.rotationFactor;rz=-x*WRECK.rotationFactor}
    let dy=p.vertical*spec.verticalFactor*dt-WRECK.verticalDeceleration*dt*dt;
    let localX=spec.position[0]+p.x,localZ=spec.position[2]+p.z,c=Math.cos(w.yaw),s=Math.sin(w.yaw);
    let floor=ground(w.x+c*localX+s*localZ,w.z-s*localX+c*localZ,w.y+spec.position[1]+p.y+5)-w.y-spec.position[1];
    let fallingToGround=dy<0&&p.y+dy<floor;
    if(fallingToGround)dy=floor-p.y;else moving=true;
    p.x+=dx;p.y+=dy;p.z+=dz;p.rx+=rx;p.rz+=rz;
    p.horizontal=Math.max(0,p.horizontal-WRECK.horizontalDeceleration*dt);p.vertical-=WRECK.verticalDeceleration*dt;
    if(p.horizontal>0)moving=true;
    // Deliberately per engine update, matching 43ed4e rather than dt scaling.
    if(!moving){p.scale+=WRECK.scalePerUpdate;if(p.scale<WRECK.minimumScale)p.visible=false;else shrinking=true}
   }
   if(old<=WRECK.bodyDelay&&w.seconds>WRECK.bodyDelay)w.body.visible=random()%WRECK.bodyChanceDenominator===0;
   if(w.body.visible&&w.seconds>WRECK.bodyDelay){let b=w.body;b.x+=b.vx*dt;b.z+=b.vz*dt;
    if(b.x>WRECK.bodyBounds[1])b.vx=-WRECK.bodyVelocity[0];else if(b.x<WRECK.bodyBounds[0])b.vx=WRECK.bodyVelocity[0];
    if(b.z>WRECK.bodyBounds[1])b.vz=-WRECK.bodyVelocity[1];else if(b.z<WRECK.bodyBounds[0])b.vz=WRECK.bodyVelocity[1];
   }
   if(!moving&&!shrinking&&w.seconds>WRECK.settleSeconds){w.body.visible=false;w.settled=true}
  }
 }
 hitBody(w){if(!w?.body.visible)return false;w.body.visible=false;w.body.hit=true;return true}
 bodyPosition(w){let c=Math.cos(w.yaw),s=Math.sin(w.yaw);return {x:w.x+c*w.body.x+s*w.body.z,y:w.y,z:w.z-s*w.body.x+c*w.body.z}}
}
