import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation,DYNAMICS} from '../../src/simulation.js';
import {updateDrive} from '../../src/drive.js';
import {NITRO,runnerContact,steerNitro} from '../../src/runner-contact.js';
const pair=()=>{let s=new Simulation(),a=s.runners[0],b=s.runners[1];Object.assign(a,{shield:0,speed:0});Object.assign(b,{shield:0,speed:0});return {s,a,b}};
test('Nitro Ram acceleration, steering and impact values match native source data',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),f=va=>exe.readFloatLE(va-0x480000+0x68e00);
 assert.equal(NITRO.acceleration,f(0x48f194));assert.equal(NITRO.steerDegrees,f(0x48450c));assert.equal(NITRO.contactDamage,-f(0x4841fc));assert.equal(NITRO.normalContactFactor,f(0x4841f8));
});
test('Nitro Ram boosts forward acceleration, steers toward a lock and preserves a second pickup while active',()=>{
 let {s,a,b}=pair();Object.assign(a,{x:100,z:100,yaw:0});Object.assign(b,{x:110,z:50});
 s.collect(a,{type:'enh_ntro.gam'});s.collect(a,{type:'enh_ntro.gam'});s.cycleWeapon(a);s.secondary(a);
 assert.equal(a.nitro,Math.fround(DYNAMICS.nitroDuration));assert.equal(a.nitroTarget,1);
 updateDrive(a,{throttle:1},1/60,DYNAMICS);assert.equal(a.acceleration,350);assert.ok(a.speed>5.8);
 steerNitro(a,b,1/60);assert.ok(a.yaw<0);
 s.cycleWeapon(a);s.secondary(a);assert.deepEqual(a.weapons,[null,'Nitro Ram']);
});
test('Nitro Ram contacts award 300 even against shields and stop the boost after a kill',()=>{
 let {s,a,b}=pair();a.nitro=1;b.shield=8;runnerContact(s,a,b);assert.equal(s.score,300);assert.equal(b.health,100);assert.equal(a.nitro,1);
 b.shield=0;b.health=20;runnerContact(s,a,b);assert.equal(s.score,600);assert.equal(b.health,0);assert.equal(a.kills,1);assert.equal(a.nitro,0);
});
test('two boosted runners damage each other; ordinary runner contacts scale with speed',()=>{
 let {s,a,b}=pair();a.nitro=1;b.nitro=1;runnerContact(s,a,b);assert.ok(a.health<100);assert.equal(b.health,0);assert.equal(s.score,300);
 ({s,a,b}=pair());a.speed=80;runnerContact(s,a,b);assert.ok(Math.abs(b.health-(100-80*NITRO.normalContactFactor*.85*1.1))<.00001);assert.equal(a.health,100);assert.equal(s.score,0);
});
