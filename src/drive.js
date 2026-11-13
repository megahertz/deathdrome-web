import {GAME_TABLES} from './game-tables.js';

// Recovered from ddrome.exe: input accumulation at 0x42f0f0 / 0x42f200,
// rate integration at 0x42f39c. Input sampling frequency still needs measurement.
const RAD=Math.PI/180;
export function originalDamping(x){
 // Original 256-entry exp(-n/51) table, indexed by truncating x*51.
 if(x<0)return 1;if(x>5)return 0;
 return Math.fround(Math.exp(-Math.trunc(Math.fround(x*51))*Math.fround(1/51)));
}
// Controller requests are accumulated before the physical action. Eligibility
// for applying acceleration is tested separately by the native grounded and
// controller-enable bytes; an airborne actor retains its stored rates.
export function applyDriveControls(r,control,dynamics){
 const f=Math.fround,rates=control.driveRates,steer=control.steer||0,throttle=control.throttle||0;
 let turn=f(r.turn/RAD),turnAcceleration=f(r.turnAcceleration/RAD),acceleration=f(r.acceleration),brake=r.supportBrake??dynamics.brakes[1];
 if(rates){turn=f(rates.turn/RAD);turnAcceleration=f(rates.turnAcceleration/RAD);acceleration=f(rates.acceleration)}
 else{
  if(steer){if(turn&&Math.sign(turn)!==Math.sign(steer))turn=0;if(turnAcceleration&&Math.sign(turnAcceleration)!==Math.sign(steer))turnAcceleration=0;turnAcceleration=f(turnAcceleration+f(steer*dynamics.turnAccelerationStep));if(Math.abs(turnAcceleration)<dynamics.turnAccelerationStep)turnAcceleration=Math.sign(turnAcceleration)*dynamics.turnAccelerationStep}
  else turnAcceleration=0;
  if(r.actionMode!==5){
   if(control.brake){acceleration=0;brake=dynamics.brakes[2]}
   else if(throttle<0&&r.nitro<=0){if(f(r.speed)<10)acceleration=f(acceleration-dynamics.accelerationStep);else{acceleration=0;brake=dynamics.brakes[2]}}
   else if(throttle>0&&f(r.speed)<=-10){acceleration=0;brake=dynamics.brakes[2]}
   else{acceleration=throttle>0?f(acceleration+dynamics.accelerationStep):0;brake=dynamics.brakes[1]}
  }
 }
 r.turn=turn*RAD;r.turnAcceleration=turnAcceleration*RAD;r.acceleration=acceleration;r.supportBrake=brake;
}
export function updateDrive(r,control,seconds,dynamics,{controlsApplied=false,human=false}={}){
 if(!controlsApplied)applyDriveControls(r,control,dynamics);
 const f=Math.fround,dt=f(seconds),limits=GAME_TABLES.runners[r.id];let turn=f(r.turn/RAD),turnAcceleration=f(r.turnAcceleration/RAD),acceleration=f(r.acceleration),brake=r.supportBrake??dynamics.brakes[1];
 const grounded=r.grounded===undefined?!(Number.isFinite(r.floor)&&r.y-r.floor>1):r.grounded,enabled=r.controlsEnabled!==false,apply=grounded&&enabled;
 if(apply&&!r.directSteering){turnAcceleration=Math.max(-dynamics.maxTurnAcceleration,Math.min(dynamics.maxTurnAcceleration,turnAcceleration));if(turnAcceleration)turn=Math.max(-limits.maxTurnDegrees,Math.min(limits.maxTurnDegrees,f(turn+dt*turnAcceleration)));else turn=f(turn*originalDamping(f(dt*dynamics.turnDamping)))}
 else if(!apply)turn=f(turn*originalDamping(f(dt*dynamics.turnDamping)));
 if(r.movementEnabled===false){turn=0;if(acceleration<0)acceleration=0;if(f(r.y)===0)r.movementEnabled=true}
 let heading=f(f(r.yaw/RAD)+dt*turn);if(heading>360)heading=f(heading-360);if(heading< -360)heading=f(heading+360);r.yaw=heading*RAD;
 let localForward=f(-f(r.speed)+f(r.slopeImpulse??0)),maximum=limits.maxSpeed;
 if(apply){
  if(acceleration){
   if(r.nitro>0){acceleration=GAME_TABLES.secondary.nitroRam.acceleration;maximum=dynamics.nitroRate}
   else{acceleration=Math.max(-f(dynamics.maxAcceleration*GAME_TABLES.drive.reverseAccelerationFactor),Math.min(dynamics.maxAcceleration,acceleration));maximum=human?limits.maxSpeed:r.aiMaxSpeed??limits.maxSpeed}
   localForward=f(localForward-dt*acceleration);
  }else{localForward=f(localForward*originalDamping(f(dt*brake)));if(r.nitro>0)maximum=dynamics.nitroRate}
  r.lateralSpeed=f(f(r.lateralSpeed||0)*originalDamping(f(dt*dynamics.brakes[1])));
 }else{
  const damping=originalDamping(f(dt*dynamics.brakes[0]));localForward=f(localForward*damping);r.lateralSpeed=f(f(r.lateralSpeed||0)*damping);if(r.nitro>0)maximum=dynamics.nitroRate;
 }
 localForward=Math.max(-f(maximum),Math.min(f(maximum),localForward));
 r.speed=-localForward;r.acceleration=acceleration;r.turn=turn*RAD;r.turnAcceleration=turnAcceleration*RAD;r.supportBrake=brake;
}

export function disableControls(r,seconds){r.controlsEnabled=false;r.disableTimer=Math.fround(seconds);r.disrupted=r.disableTimer}
// 42f83a stores the decremented timer and restores +14d only below zero.
export function stepControlDisable(r,seconds){
 if(r.controlsEnabled!==false)return false;
 r.disableTimer=Math.fround(Math.fround(r.disableTimer??0)-Math.fround(seconds));r.disrupted=Math.max(0,r.disableTimer);
 if(r.disableTimer<0){r.controlsEnabled=true;return true}return false;
}
