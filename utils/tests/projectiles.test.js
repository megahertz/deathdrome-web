import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../../src/simulation.js';
import {missileTarget,steerMissile,stepRunnerProjectiles,PROJECTILE} from '../../src/projectiles.js';
test('a native laser press launches two alternating muzzle shots with inherited forward speed',()=>{
 let s=new Simulation(),r=s.runners[0];Object.assign(r,{x:100,y:0,z:100,yaw:0,speed:75});s.fire(r);assert.ok(s.projectiles.every(p=>p.pending));stepRunnerProjectiles(s,r,1/60);
 assert.equal(s.projectiles.length,2);assert.equal(s.projectiles[0].speed,225);assert.equal(s.projectiles[0].life,1-Math.fround(1/60));
 assert.ok(Math.abs(s.projectiles[0].x-101.009)<.00001);assert.ok(Math.abs(s.projectiles[1].x-98.991)<.00001);assert.ok(Math.abs(s.projectiles[0].z-89.643)<.00001);assert.ok(Math.abs(s.projectiles[0].y-.974)<.00001);
 s.projectiles=[];r.speed=-40;s.fire(r);stepRunnerProjectiles(s,r,1/60);assert.equal(s.projectiles[0].speed,150);
});
test('laser/missile slots share the twelve-projectile limit and a full pool preserves a missile pickup',()=>{
 let s=new Simulation(),r=s.runners[0];for(let i=0;i<6;i++)s.fire(r);assert.equal(s.projectiles.length,12);s.collect(r,{type:'enh_lock.gam'});s.cycleWeapon(r);s.secondary(r);assert.equal(s.projectiles.length,12);assert.equal(r.weapon,'Missile');
 s.projectiles.pop();s.secondary(r);assert.equal(s.projectiles.length,12);assert.equal(s.projectiles.at(-1).kind,'Missile');assert.equal(s.projectiles.at(-1).life,4);assert.equal(r.weapon,'Missile');stepRunnerProjectiles(s,r,1/60);assert.equal(r.weapon,null);
});
test('missile lock excludes targets behind and beyond range, and favors projected proximity',()=>{
 let r={id:0,x:0,y:0,z:0,yaw:0},runners=[r,{id:1,x:0,y:0,z:10},{id:2,x:0,y:0,z:-1100},{id:3,x:0,y:0,z:-100},{id:4,x:80,y:0,z:-10}];assert.equal(missileTarget(r,runners),3);
 runners[3].dead=1;assert.equal(missileTarget(r,runners),4);
});
test('missile steering turns vertically toward its target while preserving direction length',()=>{
 let p={x:0,y:0,z:0,dx:0,dy:0,dz:-1};steerMissile(p,{x:20,y:10,z:-20},1/60);assert.ok(p.dx>0);assert.ok(p.dy>0);assert.ok(Math.abs(Math.hypot(p.dx,p.dy,p.dz)-1)<2e-7);
});
test('shielded projectile contacts still score without subtracting health',()=>{
 let s=new Simulation();s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>Object.assign(r,{x:500+r.id*10,y:0,z:500}));let p=s.runners[0],q=s.runners[1];Object.assign(p,{x:100,z:100,yaw:0});Object.assign(q,{x:100,z:92,shield:8});s.step(1/60,{fire:true});assert.equal(q.health,100);assert.equal(s.score,200);
});
