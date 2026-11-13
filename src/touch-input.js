import {GAME_TABLES} from './game-tables.js';
import {originalDamping} from './drive.js';
export const TOUCH_CODES={FIRE:'AltLeft',BARRIER:'ControlLeft',WEAPON:'ShiftLeft',JUMP:'Space'};
const EDGES=new Set(['AltLeft','AltRight','ShiftLeft','ShiftRight','Space']);
export function joystickTurnRate(dx,radius,maxDegrees){const x=Math.min(1,Math.abs(dx)/radius);return x<.035?0:-Math.sign(dx)*x*x*maxDegrees*Math.PI/180}
export function joystickSpeedFraction(distance,radius){
 const travel=distance/radius;
 // Keep the crawl range unchanged; compress only the upper range so full
 // throttle needs 25% less finger travel. Steering uses its original radius.
 return Math.max(0,Math.min(1,travel<=.5?(travel-.25)/.75:(travel-.375)/.375));
}
export function joystickKeys(dx,dy,radius,pose=null){
 if(Math.hypot(dx,dy)<=radius*.25)return [];
 const limit=Math.max(Math.abs(dx),Math.abs(dy))*Math.tan(Math.PI/8),keys=[];
 if(pose){
  // Lateral tilt controls turn RATE, never an absolute heading. Choose a
  // native steering key or a neutral tick to follow a gentle proportional
  // rate without modifying physics or snapping back to touch-down heading.
  const maximum=GAME_TABLES.runners[pose.id??0].maxTurnDegrees,target=joystickTurnRate(dx,radius,maximum),turn=pose.turn||0;
  if(target&&pose.grounded!==false&&pose.controlsEnabled!==false){
   const sign=Math.sign(target),base=turn*sign<0?0:turn,accel=(pose.turnAcceleration||0)*sign>0?Math.abs(pose.turnAcceleration)*180/Math.PI:0;
   const pressed=base+sign*Math.min(800,Math.max(100,accel+100))*Math.PI/180/60,released=turn*originalDamping(15/60);
   if(Math.abs(pressed-target)<Math.abs(released-target))keys.push(target>0?'ArrowLeft':'ArrowRight');
  }
 }else if(Math.abs(dx)>=limit)keys.push(dx<0?'ArrowLeft':'ArrowRight');
 if(Math.abs(dy)>=limit){
  const sign=dy<0?1:-1,strength=joystickSpeedFraction(Math.hypot(dx,dy),radius),target=pose?GAME_TABLES.runners[pose.id??0].maxSpeed*strength:Infinity;
  // Feather the existing forward/reverse key around the requested speed.
  // Native coasting supplies deceleration; full tilt retains the keyboard cap.
  if(!pose||strength>=1||pose.nitro>0||(pose.speed||0)*sign<target)keys.push(dy<0?'ArrowUp':'ArrowDown');
 }
 return keys;
}
export function touchedButtons(x,y,width,height,buttons){
 const contact=Math.min(18,Math.max(width||1,height||1)/2);
 return buttons.filter(b=>Math.hypot(x-b.x,y-b.y)<=b.radius+contact+3).map(b=>b.name);
}

// Pointer ownership and queued key edges are independent of DOM and simulation.
// A short tap survives until a fixed update; two taps get a release update
// between them, as required by the existing Fire/Jump input latches.
export class TouchInput{
 constructor(keys,{vibrate=()=>{},getPose=()=>null}={}){this.keys=keys;this.keyboard=new Set();this.pointers=new Map();this.owned=new Set();this.queued=new Map();this.high=new Set();this.vibrate=vibrate;this.getPose=getPose;this.enabled=false;this.stick=null;this.geometry={width:0,radius:64,buttons:[]}}
 setGeometry(geometry){this.geometry=geometry}
 key(code,down){if(down){if(!this.keyboard.has(code)&&EDGES.has(code)){const q=this.queued.get(code)||[];q.push('keyboard');this.queued.set(code,q)}this.keyboard.add(code)}else this.keyboard.delete(code);this.publish()}
 down(id,x,y,width=1,height=1){
  if(!this.enabled||this.pointers.has(id))return false;
  const role=touchedButtons(x,y,width,height,this.geometry.buttons).length?'buttons':x<this.geometry.width/2?'stick':'buttons';
  const p={role:role==='stick'&&this.stick?'ignored':role,x,y,width,height,originX:x,originY:y,buttons:[]};
  this.pointers.set(id,p);if(p.role==='stick')this.stick=p;this.move(id,x,y,width,height);return true;
 }
 move(id,x,y,width=1,height=1){
  const p=this.pointers.get(id);if(!p)return;
  Object.assign(p,{x,y,width,height});
  if(p.role==='buttons'){
   const next=touchedButtons(x,y,width,height,this.geometry.buttons);
   for(const name of next)if(!p.buttons.includes(name)&&EDGES.has(TOUCH_CODES[name])){const code=TOUCH_CODES[name],q=this.queued.get(code)||[];q.push(id);this.queued.set(code,q);this.vibrate(12)}
   p.buttons=next;
  }
  this.publish();
 }
 up(id){const p=this.pointers.get(id);if(p===this.stick)this.stick=null;this.pointers.delete(id);this.publish()}
 cancel(id){for(const [code,q]of this.queued)this.queued.set(code,q.filter(owner=>owner!==id));this.up(id)}
 desired(){
  const codes=new Set();
  if(this.stick)for(const code of joystickKeys(this.stick.x-this.stick.originX,this.stick.y-this.stick.originY,this.geometry.radius,this.getPose()))codes.add(code);
  for(const p of this.pointers.values())for(const name of p.buttons)codes.add(TOUCH_CODES[name]);
  return codes;
 }
 publish(frame=null){
  const wanted=this.desired();
  for(const code of EDGES){if(frame){if(frame.has(code))wanted.add(code);else wanted.delete(code)}else if(this.queued.get(code)?.length)wanted.add(code)}
  for(const code of this.owned)if(!wanted.has(code)&&!this.keyboard.has(code))this.keys.delete(code);
  this.owned=wanted;for(const code of wanted)this.keys.add(code);for(const code of this.keyboard)if(!frame||!EDGES.has(code)||frame.has(code))this.keys.add(code);
  // Keyboard keyup must retain a key owned by any touch pointer.
  for(const code of this.previousKeyboard??[])if(!this.keyboard.has(code)&&!wanted.has(code))this.keys.delete(code);
  this.previousKeyboard=new Set(this.keyboard);
 }
 beforeStep(){
  const wanted=new Set([...this.desired(),...this.keyboard]),frame=new Set();
  for(const code of EDGES){let down=wanted.has(code),pending=this.queued.get(code);if(pending?.length){down=!this.high.has(code);if(down)pending.shift()}if(down)frame.add(code)}
  this.high=frame;this.publish(frame);
 }
 reset({keyboard=false}={}){
  this.pointers.clear();this.stick=null;this.queued.clear();this.high.clear();
  if(keyboard){this.keyboard.clear();this.keys.clear();this.previousKeyboard=new Set()}
  this.publish();
 }
}
