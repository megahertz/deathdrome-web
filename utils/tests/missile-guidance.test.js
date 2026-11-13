import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {steerMissile,updateMissileLock,missileTarget,launchProjectiles,stepProjectileMotion} from '../../src/projectiles.js';
import {Simulation} from '../../src/simulation.js';
test('missile guidance reproduces original float velocity and Euler-increment fixtures',()=>{
 const a=JSON.parse(fs.readFileSync(new URL('../../private/verification/missile-guidance-native-audit.json',import.meta.url)));
 for(let i=0;i<a.fixtures.length;i++){let {p,target,dt}=structuredClone(a.fixtures[i]);steerMissile(p,target,dt);assert.deepEqual([p.vx,p.vy,p.vz],a.native[i].velocity);assert.equal(p.steering.pitchDelta,a.native[i].pitchDelta);assert.equal(p.steering.yawDelta,a.native[i].yawDelta)}
});
test('shared lock selection matches native range, zone, activity, retention and rounding fixtures',()=>{
 const a=JSON.parse(fs.readFileSync(new URL('../../private/verification/missile-locks-native-audit.json',import.meta.url)));
 a.fixtures.forEach((fixture,i)=>{let {runners,active,previous}=structuredClone(fixture),r=runners[0];r.missileLockTarget=previous;let sim={runners,projectiles:active?[{owner:0,kind:'Missile',life:1}]:[]};assert.equal(updateMissileLock(sim,r),a.native[i])});
});
test('combined moving-target flights reproduce native velocity, position, age and stored visual angles',()=>{
 const a=JSON.parse(fs.readFileSync(new URL('../../private/verification/missile-flight-native-audit.json',import.meta.url)));
 a.fixtures.forEach(({r,dt,targets},i)=>{r=structuredClone(r);let sim={player:0,runners:[r],projectiles:[],emit(){}};launchProjectiles(sim,r,true);let p=sim.projectiles[0];targets.forEach((t,j)=>{if(p.age>0)steerMissile(p,t,dt);stepProjectileMotion(p,dt);let n=a.native[i][j];assert.deepEqual([p.x,p.y,p.z],n.position);assert.deepEqual([p.vx,p.vy,p.vz],n.velocity);assert.deepEqual([p.angles.pitch,p.angles.yaw,p.angles.roll],n.angles);assert.equal(p.age,n.age);assert.equal(p.life>0,n.active)})});
});
test('non-Nitro/non-missile selection preserves the shared pointer without scanning',()=>{
 let r={id:0,x:0,z:0,yaw:0,weapon:'Ion Sword',missileLockTarget:1},sim={runners:[r,{id:1,x:0,z:100,dead:1}],projectiles:[]};assert.equal(updateMissileLock(sim,r),1);r.weapon='Nitro Ram';assert.equal(updateMissileLock(sim,r),null);
});
test('equal lock geometry follows the original extended-precision comparison against a float best',()=>{
 let r={id:0,x:0,z:0,yaw:0},a={id:1,x:0,z:-100},b={id:2,x:0,z:-100};assert.equal(missileTarget(r,[b,r,a]),2);
});
test('all live missiles follow their owner shared lock and retain its last pointer when candidates disappear',()=>{
 let s=new Simulation({ground:()=>0,blocked:()=>false,wallContact:()=>null});s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>r.dead=Infinity);
 let r=s.runners[0],a=s.runners[1],b=s.runners[2];Object.assign(r,{dead:0,x:100,y:0,z:100,yaw:0,speed:0,weapon:'Missile'});Object.assign(a,{dead:0,x:100,y:0,z:0});Object.assign(b,{dead:0,x:100,y:0,z:-100});launchProjectiles(s,r,true);launchProjectiles(s,r,true);assert.equal(s.projectiles.length,2);assert.equal(r.missileLockTarget,1);
 a.z=150;b.z=0;s.step(1/60);assert.equal(r.missileLockTarget,2);assert.ok(s.projectiles.every(p=>p.target===2));b.dead=1;s.step(1/60);assert.equal(r.missileLockTarget,2);assert.ok(s.projectiles.every(p=>p.target===2));
});
test('laser cleanup clears the shared pointer even while a missile remains in flight',()=>{
 let s=new Simulation({ground:()=>0,blocked:()=>false,wallContact:()=>null});s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>r.dead=Infinity);let r=s.runners[0];Object.assign(r,{dead:0,x:100,y:0,z:100,yaw:0,speed:0,weapon:'NanoShield',missileLockTarget:1});
 s.projectiles=[{kind:'Laser',owner:0,x:100,y:10,z:100,dx:0,dy:0,dz:-1,speed:150,age:.999,lifetime:1,life:.001},{kind:'Missile',owner:0,x:100,y:10,z:80,dx:0,dy:0,dz:-1,speed:150,age:.1,lifetime:4,life:3.9,target:1}];s.step(1/60);assert.equal(r.missileLockTarget,null);assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].target,null);
});
test('zero-heading guidance preserves a finite incoming vector while native stack behavior remains explicitly excluded',()=>{
 let p={x:0,y:10,z:0,dx:0,dy:0,dz:-1,speed:150};steerMissile(p,{x:50,y:10,z:-100},1/60);assert.ok([p.vx,p.vy,p.vz,p.dx,p.dy,p.dz].every(Number.isFinite));assert.ok(p.vx>0);
});
