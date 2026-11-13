import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation} from '../../src/simulation.js';
import {queueProjectiles,stepRunnerProjectiles} from '../../src/projectiles.js';
import {inventoryCells,selectInventoryWeapon} from '../../src/inventory.js';

test('allocation, selection changes and first slot actions match 64 original executable cases',()=>{
 const a=JSON.parse(fs.readFileSync(new URL('../../private/verification/projectile-initialization-native-audit.json',import.meta.url)));
 a.fixtures.forEach((f,i)=>{
  let events=[],r={id:0,x:0,y:0,z:0,yaw:0,speed:0,weaponCells:[4,1,5,6],weapons:[null,'Missile','Ion Sword','NanoShield'],selectedWeapon:f.missile?1:0,muzzleSide:f.side,missileLockTarget:1},q={id:1,x:f.behind?100:-20,y:10,z:f.behind?140:-20},sim={player:f.human?0:1,runners:[r,q],projectiles:[],emit(type,data){events.push({type,...data})}};selectInventoryWeapon(r);
  for(let j=0;j<f.presses;j++)queueProjectiles(sim,r,f.missile);
  const sounds=()=>events.filter(e=>e.type==='shot').map(e=>e.soundId),before={count:sim.projectiles.length,cells:[...inventoryCells(r)],selected:r.selectedWeapon,side:r.muzzleSide,sounds:sounds()};
  assert.ok(sim.projectiles.every(p=>p.pending&&p.x===undefined));
  Object.assign(r,{selectedWeapon:f.selected,x:40,y:10,z:60,yaw:36.86989764584402*Math.PI/180,speed:75,forwardVector:{x:Math.fround(-.6),y:0,z:Math.fround(-.8)},planarForwardVector:{x:Math.fround(-.6),z:Math.fround(-.8)}});selectInventoryWeapon(r);stepRunnerProjectiles(sim,r,f.dt);
  assert.deepEqual({before,slots:sim.projectiles.map(p=>({slot:p.slot,position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],age:p.age})),cells:[...inventoryCells(r)],count:r.weapons.length,selected:r.selectedWeapon,side:r.muzzleSide,target:r.missileLockTarget,sounds:sounds()},a.native[i]);
 });
});
test('a single free laser slot delays its alternating sound until the next muzzle',()=>{
 const r={id:0,x:100,y:10,z:100,yaw:0,speed:0,weapon:null},events=[],sim={player:0,runners:[r],projectiles:Array.from({length:11},(_,slot)=>({owner:0,slot,kind:'Laser',x:0,y:10,z:0,vx:0,vy:0,vz:0,age:.1,life:.9})),emit(type,data){events.push({type,...data})}};
 queueProjectiles(sim,r);assert.equal(r.muzzleSide,undefined);assert.equal(events.length,0);stepRunnerProjectiles(sim,r,1/60);assert.equal(r.muzzleSide,1);assert.equal(events.length,0);
 sim.projectiles.pop();queueProjectiles(sim,r);stepRunnerProjectiles(sim,r,1/60);assert.equal(r.muzzleSide,0);assert.deepEqual(events.map(e=>e.soundId),[2]);
});
test('production firing consumes the current selected cell during initialization',()=>{
 const s=new Simulation(),r=s.runners[0];Object.assign(r,{weapons:[null,'Missile','Ion Sword'],selectedWeapon:1});s.selectWeapon(r);s.events=[];s.secondary(r);
 assert.deepEqual(r.weapons,[null,'Missile','Ion Sword']);assert.equal(s.events.length,0);assert.equal(s.projectiles[0].pending,true);
 s.cycleWeapon(r);assert.equal(r.weapon,'Ion Sword');stepRunnerProjectiles(s,r,1/60);
 assert.deepEqual(r.weapons,[null,'Missile']);assert.equal(r.weapon,null);assert.equal(s.projectiles[0].pending,false);assert.equal(s.events.at(-1).soundId,9);
});
