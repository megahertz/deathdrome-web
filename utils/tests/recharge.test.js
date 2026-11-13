import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RechargeOrbs} from '../../src/recharge.js';
import {Simulation} from '../../src/simulation.js';
import {GAME_TABLES} from '../../src/game-tables.js';

const paths=JSON.parse(await readFile(new URL('../../private/assets/recharge-paths.json',import.meta.url)));
test('all 32 original recharge routes decode and their round tables match the executable',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url));
 assert.equal(paths.length,8);
 for(let a=0;a<8;a++){
  assert.equal(paths[a].length,4);
  for(let path of paths[a]){assert.ok(path.length>=4);for(let v of path)assert.ok(v.every(Number.isFinite))}
  for(let r=0;r<3;r++){let offset=0x48f62c-0x480000+0x68e00+(a*3+r)*8;
   assert.deepEqual(GAME_TABLES.recharge.rounds[a][r],{count:exe.readUInt32LE(offset),speed:exe.readFloatLE(offset+4)})}
 }
});
test('recharge orbs move at original speed and respawn on a free route after five seconds',()=>{
 let system=new RechargeOrbs({arena:2,round:2,paths:paths[1]});
 assert.equal(system.orbs.length,3);let orb=system.orbs[0],before={...orb};system.step(.1);
 assert.ok(Math.abs(Math.hypot(orb.x-before.x,orb.z-before.z)-2.4)<1e-8);
 system.collect(orb);system.step(4.99);assert.ok(orb.cooldown>0);system.step(.02);
 assert.equal(orb.cooldown,0);assert.equal(new Set(system.orbs.map(o=>o.path)).size,3);
});
test('capturing an orb restores health and awards 500 points even when already healthy',()=>{
 let s=new Simulation({rechargePaths:paths[0]}),r=s.runners[0];s.countdown=0;
 let orb=s.recharge.orbs[0];Object.assign(r,{x:orb.x,y:orb.y,z:orb.z,health:10});s.step(1/60);
 assert.equal(r.health,100);assert.equal(r.keys,1);assert.equal(s.score,500);assert.equal(orb.cooldown,5);
});
