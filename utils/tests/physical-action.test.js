import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation,DYNAMICS} from '../../src/simulation.js';
import {applyDriveControls} from '../../src/drive.js';
import {localToWorld} from '../../src/suspension.js';
import {heldAIRates} from '../../src/ai-obstacles.js';
import {cockpitRollDegrees} from '../../src/runner-pose.js';
import {View,THREE,makeModel} from '../../src/renderer.js';

function compare(actual,expected,tolerance,path=''){
 if(typeof expected==='number'){assert.ok(Math.abs(actual-expected)<=tolerance,`${path}: ${actual} != ${expected}`);return}
 if(expected&&typeof expected==='object'){assert.deepEqual(Object.keys(actual),Object.keys(expected),path);for(const k in expected)compare(actual[k],expected[k],tolerance,`${path}.${k}`);return}
 assert.equal(actual,expected,path);
}
function analyticWalls(a,b){let hits=[];for(let [axis,limit,sign] of [['x',20,1],['x',40,-1],['z',30,1],['z',50,-1]]){let delta=b[axis]-a[axis];if(!delta)continue;let fraction=(limit-a[axis])/delta;if(fraction>=0&&fraction<=1){let point={x:Math.fround(a.x+fraction*(b.x-a.x)),y:Math.fround(a.y+fraction*(b.y-a.y)),z:Math.fround(a.z+fraction*(b.z-a.z))},normal={x:0,y:0,z:0};normal[axis]=sign;hits.push({fraction,node:{name:'wall'},normal,point})}}return hits.sort((a,b)=>a.fraction-b.fraction)}
function triangleWalls(){const view=Object.create(View.prototype),faces=[];for(let [axis,limit,sign] of [['x',20,1],['x',40,-1],['z',30,1],['z',50,-1]]){let v=axis==='x'?[[limit,-2000,-2000],[limit,2000,-2000],[limit,2000,2000],[limit,-2000,2000]]:[[-2000,-2000,limit],[2000,-2000,limit],[2000,2000,limit],[-2000,2000,limit]];if(sign<0)v.reverse();faces.push({name:'room/wall_'+axis+limit,texture:null,color:[.5,.5,.5],drawType:1,intersect:true,altitude:false,v:v.map(p=>[...p,0,0])})}view.arenaGroup=makeModel({meshes:faces});view.arenaGroup.updateMatrixWorld(true);view.collisionMaterials=new Map();view.arenaGroup.traverse(o=>{if(o.material)view.collisionMaterials.set(o.material,o.material.side)});view.ray=new THREE.Raycaster();// These historical native physical fixtures supply analytic distance order.
// Keep that supplied collector contract explicit; native World traversal is
// independently compared in scene-order and full GameGen query tests.
return (a,b)=>view.sweepContacts(a,b).sort((x,y)=>Math.hypot(x.point.x-a.x,x.point.y-a.y,x.point.z-a.z)-Math.hypot(y.point.x-a.x,y.point.y-a.y,y.point.z-a.z))}
for(const [report,label,sceneSweep] of [['physical-action-native-audit','complete collision-free physical callback',null],['collision-physical-native-audit','complete physical callback with wall sweeps, response and correction queries',analyticWalls],['collision-physical-native-audit','physical callback using polygon queries with supplied analytic order',triangleWalls()],['collision-long-native-audit','five-second collision/physical traces over analytic walls',analyticWalls],['collision-long-native-audit','five-second physical traces with polygon queries and supplied analytic order',triangleWalls()]])test(label+' matches native update traces',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../../private/verification/'+report+'.json',import.meta.url)));
 audit.fixtures.forEach((f,index)=>{
  const t=f.terrain,s=new Simulation({player:f.human?f.r.id:(f.r.id+1)%8,maximumRunners:8,ground(x,z,y,support){const height=Math.fround(t.base+t.sx*x+t.sz*z),length=Math.sqrt(1+t.sx*t.sx+t.sz*t.sz);return support?[{height,normal:{x:Math.fround(-t.sx/length),y:Math.fround(1/length),z:Math.fround(-t.sz/length)}}]:height},blocked:()=>false,wallContact:()=>null,sceneSweep});
  s.countdown=0;s.time=300;s.runners.forEach(r=>r.dead=Infinity);const r=s.runners[f.r.id];Object.assign(r,f.r,{dead:0,inactive:false,collisionProbe:{x:Math.fround(f.r.x),y:Math.fround(f.r.y),z:Math.fround(f.r.z)}});r.worldVelocity=localToWorld(r,{x:r.lateralSpeed,y:r.localVerticalSpeed,z:-r.speed});r.vy=r.worldVelocity.y;s.ai=r=>({driveRates:heldAIRates(r)});
  const trace=[];
  for(let i=0;i<(audit.stepsPerFixture??3);i++){
   s.step(f.dt,{driveRates:heldAIRates(r)});
   trace.push({position:[r.x,r.y,r.z],yaw:r.yaw*180/Math.PI,pitch:r.chassisPitchDegrees,roll:r.chassisRollDegrees,turn:r.turn*180/Math.PI,turnAcceleration:r.turnAcceleration*180/Math.PI,acceleration:r.acceleration,localVelocity:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],worldVelocity:Object.values(r.worldVelocity),forward:Object.values(r.forwardVector),planarForward:[r.planarForwardVector.x,0,r.planarForwardVector.z],frontVelocity:r.frontVelocity,sideVelocity:r.sideVelocity,grounded:r.grounded,controlsEnabled:r.controlsEnabled,disableTimer:r.disableTimer,movementEnabled:r.movementEnabled,supportContact:r.supportContact,brake:r.supportBrake,slopeImpulse:r.slopeImpulse,nitro:r.nitro,cockpitRoll:cockpitRollDegrees(r.turn)});
  }
  compare(trace,audit.native[index],audit.tolerance,`physical ${index}`);
 });
});
test('drive request accumulation matches 756 native three-callback traces',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../../private/verification/drive-controls-native-audit.json',import.meta.url)));
 audit.fixtures.forEach((f,index)=>{
  const r={id:0,actionMode:f.mode,nitro:f.nitro,speed:f.speed,turn:f.state*30*Math.PI/180,turnAcceleration:f.state*500*Math.PI/180,acceleration:f.state*80,supportBrake:Math.fround(.2)},trace=[];
  for(let i=0;i<3;i++){applyDriveControls(r,{steer:f.steer,throttle:f.throttle},DYNAMICS);trace.push({turn:r.turn*180/Math.PI,turnAcceleration:r.turnAcceleration*180/Math.PI,acceleration:r.acceleration,brake:r.supportBrake})}
  compare(trace,audit.native[index],audit.tolerance,`drive input ${index}`);
 });
});
