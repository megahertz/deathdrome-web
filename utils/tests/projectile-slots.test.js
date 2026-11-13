import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launchProjectiles,projectileSlots,stepRunnerProjectiles,PROJECTILE} from '../../src/projectiles.js';
import {Simulation} from '../../src/simulation.js';
import {steerNitro} from '../../src/runner-contact.js';
const report=name=>JSON.parse(fs.readFileSync(new URL(`../../private/verification/${name}-native-audit.json`,import.meta.url)));
test('weapon IDs match the executable fire dispatch table, including Nitro zero and Laser four',()=>{
 let exe=fs.readFileSync(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),offset=0x437520-0x410000+0x400;
 assert.deepEqual(Array.from({length:7},(_,i)=>exe.readUInt32LE(offset+i*4)),[0x43757c,0x437572,0x4375b5,0x4375c9,0x43756b,0x4375d3,0x4375dd]);assert.deepEqual(PROJECTILE.weaponIds,{'Nitro Ram':0,Missile:1,ShockWave:2,Disruptor:3,Laser:4,'Ion Sword':5,NanoShield:6});
});
test('slot allocation and one/two-shot capacity decisions match 64 original fire-dispatch fixtures',()=>{
 let a=report('projectile-slots');a.allocationFixtures.forEach(({slots,missile},i)=>{let r={id:0,x:0,y:10,z:0,yaw:0,speed:0,weapon:missile?'Missile':null},sim={player:0,runners:[r],projectiles:slots.map(p=>({...p,owner:0,life:1})),emit(){}};launchProjectiles(sim,r,missile);let active=projectileSlots(sim,r);assert.deepEqual({slots:active.map(({slot,kind})=>({slot,kind})),count:active.length},a.allocationNative[i])});
});
test('fixed slot order reproduces native mixed-projectile guidance and expiry cleanup',()=>{
 let a=report('projectile-slots');a.dispatchFixtures.forEach(({slots,dt},i)=>{let r={id:0,x:0,y:10,z:0,yaw:0,weapon:null,missileLockTarget:1},sim={runners:[r,{id:1,x:100,y:10,z:-100}],projectiles:slots.map(p=>({...p,owner:0,x:0,y:10,z:0,vx:-90,vy:0,vz:-120,dx:-.6,dy:0,dz:-.8,speed:150,lifetime:p.kind==='Missile'?4:1,life:(p.kind==='Missile'?4:1)-p.age}))};stepRunnerProjectiles(sim,r,dt);assert.deepEqual({slots:sim.projectiles.map(p=>({slot:p.slot,active:p.life>0,position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],age:p.life>0?p.age:null})),count:sim.projectiles.filter(p=>p.life>0).length,target:r.missileLockTarget},a.dispatchNative[i])});
});
test('weapon cycling preserves locks only for Nitro and Missile, matching native cycle cases',()=>{
 let a=report('weapon-selection'),sim={selectWeapon:Simulation.prototype.selectWeapon,emit(){}};a.cycles.forEach(({selected,weapons},i)=>{let r={selectedWeapon:selected,weapons,missileLockTarget:1};Simulation.prototype.cycleWeapon.call(sim,r);assert.deepEqual({selected:r.selectedWeapon,target:r.missileLockTarget},a.cycleNative[i])});
});
test('Nitro steering matches original float heading outputs from supplied planar bases',()=>{
 let a=report('weapon-selection');a.nitro.forEach((fixture,i)=>{let {r,target,dt}=structuredClone(fixture);steerNitro(r,target,dt);assert.equal(Math.fround(r.yaw*180/Math.PI),a.nitroNative[i])});
});
test('an active Nitro boost follows the shared pointer and stops steering when weapon cycling clears it',()=>{
 let s=new Simulation({ground:()=>0,blocked:()=>false,wallContact:()=>null});s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>r.dead=Infinity);let r=s.runners[0],q=s.runners[1];Object.assign(r,{dead:0,x:100,y:0,z:100,yaw:0,speed:0,weapons:[null,'Nitro Ram','ShockWave'],selectedWeapon:1});Object.assign(q,{dead:0,x:110,y:0,z:50,speed:0});s.selectWeapon(r);s.secondary(r);assert.equal(r.nitroTarget,1);assert.equal(r.missileLockTarget,1);s.cycleWeapon(r);assert.equal(r.weapon,'ShockWave');assert.equal(r.missileLockTarget,null);s.step(1/60);assert.ok(r.nitro>0);assert.equal(r.nitroTarget,null);assert.equal(r.yaw,0);
});
