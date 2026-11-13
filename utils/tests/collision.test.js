import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COLLISION,planarVelocity,setPlanarVelocity,reflectImpact,runnerOverlap} from '../../src/collision.js';
import {runnerContact} from '../../src/runner-contact.js';
import {updateDrive,originalDamping} from '../../src/drive.js';
import {Simulation,DYNAMICS} from '../../src/simulation.js';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
function setup(){let s=new Simulation(),r=s.runners[0];Object.assign(r,{yaw:0,speed:80,lateralSpeed:0,turn:0,vy:0,shield:0});return {s,r}}
test('planar response constants match native collision instructions and data',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),data=va=>va-0x480000+0x68e00;
 assert.equal(COLLISION.velocityFactor,exe.readFloatLE(data(0x484208)));
 assert.equal(COLLISION.turnDegreesPerSpeed,exe.readFloatLE(0x432bcb-0x410000+0x400));
 assert.equal(COLLISION.impactDamage,-exe.readFloatLE(data(0x484220)));
 assert.equal(COLLISION.impactDamageThreshold,exe.readFloatLE(data(0x484214)));
});
test('legacy planar contact approximation halves speed and rejects a separating impact',()=>{
 let {s,r}=setup();reflectImpact(s,r,{x:0,z:1});close(r.speed,-40);close(r.lateralSpeed,0);close(r.turn,0);
 assert.equal(reflectImpact(s,r,{x:0,z:1}),false);
 Object.assign(r,{speed:30,vy:40});reflectImpact(s,r,{x:0,z:1});close(r.speed,-25);close(r.vy,40);
});
test('glancing contact produces sideways velocity and signed angular impulse',()=>{
 let {s,r}=setup();r.speed=40;reflectImpact(s,r,{x:Math.SQRT1_2,z:Math.SQRT1_2});let v=planarVelocity(r);
 close(v.x,20);close(v.z,0);close(r.turn,-40*9*Math.PI/180);assert.equal(r.health,100);
 for(let yaw of [0,.7,Math.PI,4.5]){r.yaw=yaw;setPlanarVelocity(r,{x:17,z:-28});let actual=planarVelocity(r);close(actual.x,17);close(actual.z,-28)}
});
test('legacy planar contact damage keeps its provisional shield and Nitro guards',()=>{
 let {s,r}=setup();reflectImpact(s,r,{x:0,z:1});assert.equal(r.health,98.16000366210938);
 for(let kind of ['shield','nitro']){let {s,r}=setup();r.shield=kind==='shield'?1:0;reflectImpact(s,r,{x:0,z:1},{nitro:kind==='nitro'});assert.equal(r.health,100)}
});
test('overlapping runners moving apart separate without repeated contact damage',()=>{
 let s=new Simulation(),a=s.runners[0],b=s.runners[1];
 Object.assign(a,{x:0,y:0,z:0,yaw:Math.PI,speed:40,lateralSpeed:0});Object.assign(b,{x:0,y:0,z:-3,yaw:0,speed:40,lateralSpeed:0});
 let contact=runnerOverlap(a,b);assert.equal(contact.aImpact,false);assert.equal(contact.bImpact,false);runnerContact(s,a,b,contact);
 assert.equal(a.health,100);assert.equal(b.health,100);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>4);assert.equal(runnerOverlap(a,b),null);
});
test('airborne inputs cannot accelerate or steer; ground steering reversal resets the old rate',()=>{
 let {r}=setup();Object.assign(r,{y:5,floor:0,grounded:false,movementEnabled:true,speed:30,lateralSpeed:20,turn:1,acceleration:0});updateDrive(r,{throttle:1,steer:1},1/60,DYNAMICS);
 close(r.speed,30*originalDamping(DYNAMICS.brakes[0]/60));close(r.lateralSpeed,20*originalDamping(DYNAMICS.brakes[0]/60));close(r.turn,originalDamping(DYNAMICS.turnDamping/60));assert.equal(r.acceleration,20);
 Object.assign(r,{y:0,grounded:true,turn:-1,turnAcceleration:-1});updateDrive(r,{steer:1},1/60,DYNAMICS);assert.ok(r.turn>0);
});
