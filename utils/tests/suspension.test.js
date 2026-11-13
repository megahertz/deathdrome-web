import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beginJump,stepSuspension} from '../../src/suspension.js';
import {Simulation} from '../../src/simulation.js';

const audit=JSON.parse(fs.readFileSync(new URL('../../private/verification/suspension-native-audit.json',import.meta.url)));
function compare(actual,expected,path=''){
 if(typeof expected==='number'){assert.ok(Math.abs(actual-expected)<=audit.tolerance,`${path}: ${actual} != ${expected}`);return}
 if(expected&&typeof expected==='object'){assert.deepEqual(Object.keys(actual),Object.keys(expected),path);for(const k in expected)compare(actual[k],expected[k],`${path}.${k}`);return}
 assert.equal(actual,expected,path);
}
function terrainHits(t,x,z){
 if(t.kind==='layers')return t.layers.flatMap(layer=>terrainHits({kind:'plane',...layer},x,z));
 const height=Math.fround(t.base+(t.kind==='plane'?t.sx*x+t.sz*z:x>=t.edge?t.height:0)),sx=t.sx??0,sz=t.sz??0,length=Math.sqrt(1+sx*sx+sz*sz),normal={x:Math.fround(-sx/length),y:Math.fround(1/length),z:Math.fround(-sz/length)};
 return [{height,normal}];
}
function terrainQuery(t,queries=[]){return (x,z)=>{
 const hits=terrainHits(t,x,z);queries.push({x,z,hits:hits.map(h=>({height:h.height,normal:Object.values(h.normal)}))});return hits;
}}
test('three-point support action matches 312 original flat, slope, step and layered-floor fixtures',()=>{
 audit.fixtures.forEach((f,i)=>{
  const r={...f.r},queries=[],result=stepSuspension(r,f.dt,terrainQuery(f.terrain,queries),{x:r.lateralSpeed,y:r.vy,z:-r.localSpeed});
  compare({position:[r.x,r.y,r.z],pitch:r.chassisPitchDegrees,roll:r.chassisRollDegrees,frontVelocity:r.frontVelocity,sideVelocity:r.sideVelocity,worldVelocity:Object.values(result.world),localVelocity:Object.values(result.local),grounded:r.grounded,supportContact:r.supportContact,mode:r.actionMode,slopeImpulse:r.slopeImpulse,brake:r.supportBrake,queries,sounds:r.human?Array(result.landingCalls).fill(1):[]},audit.native[i],`fixture ${i}`);
 });
});
test('jump eligibility, impulse and local projection match 312 original actions',()=>{
 audit.jumpFixtures.forEach((f,i)=>{
  const r={...f.r,supportContact:f.supportContact,speed:f.r.localSpeed,lateralSpeed:f.r.lateralSpeed,localVerticalSpeed:f.r.vy,worldVelocity:{x:f.r.lateralSpeed,y:f.r.vy,z:-f.r.localSpeed}};
  beginJump(r);compare({mode:r.actionMode,previous:r.previousActionMode,front:r.frontVelocity,side:r.sideVelocity,world:Object.values(r.worldVelocity),local:[r.lateralSpeed,r.localVerticalSpeed,-r.speed]},audit.jumpNative[i],`jump ${i}`);
 });
});
test('production driving uses support pitch and roll for motion, emitters and jumping',()=>{
 const query=terrainQuery({kind:'plane',base:20,sx:.15,sz:-.2}),s=new Simulation({ground:(x,z,y,support)=>support?query(x,z):query(x,z)[0].height,blocked:()=>false,wallContact:()=>null});s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>r.dead=Infinity);
 const r=s.runners[0];Object.assign(r,{dead:0,x:50,y:17.5,z:50,yaw:0,speed:30,baseHeight:17.5});
 for(let i=0;i<60;i++)s.step(1/60,{throttle:1});
 assert.ok(r.chassisPitchDegrees>5);assert.ok(Math.abs(r.chassisRollDegrees)>3);assert.equal(r.grounded,true);assert.ok(r.forwardVector.y>0);assert.ok(r.y>17.5);assert.ok(Number.isFinite(r.localVerticalSpeed));
 s.fire(r);s.step(1/60);assert.equal(s.projectiles.length,2);assert.ok(s.projectiles.every(p=>p.vy>0));assert.notEqual(s.projectiles[0].y,s.projectiles[1].y);
 const base=r.y;s.step(1/60,{jump:true});assert.equal(r.actionMode,1,'native support action restores mode inside its one-unit ground band even on the first 60 Hz jump update');assert.ok(r.y>base);assert.ok(s.events.some(e=>e.type==='jump'));
 for(let i=0;i<10;i++)s.step(1/60,{jump:true});assert.ok(s.events.every(e=>e.type!=='jump'));assert.ok(r.y>base+2);
});
