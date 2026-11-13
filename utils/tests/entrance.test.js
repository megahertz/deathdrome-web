import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation} from '../../src/simulation.js';
import {ENTRANCE,entranceHeight,beginEntrance} from '../../src/entrance.js';
test('entrance duration and runner offset match native data',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),f=va=>exe.readFloatLE(va-0x480000+0x68e00);
 assert.equal(ENTRANCE.seconds,f(0x484e63));assert.equal(ENTRANCE.spawnHeightOffset,f(0x484f0e));assert.equal(entranceHeight(0),38);assert.ok(Math.abs(entranceHeight(1.75)-19)<.00001);assert.ok(entranceHeight(3.5)<.00001);assert.equal(entranceHeight(3.5+1/60),0);
});
test('runners descend together before controls activate and the round clock includes the entrance',()=>{
 let s=new Simulation(),positions=s.runners.map(r=>[r.x,r.z]);s.step(1,{throttle:1,fire:true,jump:true});
 assert.equal(s.countdown,6);assert.equal(s.projectiles.length,0);assert.ok(s.entrance.yawDegrees>95&&s.entrance.yawDegrees<96);s.runners.forEach((r,i)=>assert.ok(Math.abs(Math.hypot(r.x,r.z)-Math.hypot(...positions[i]))<.00001));
 for(let r of s.runners)assert.ok(Math.abs(r.y-(10.01+38+ENTRANCE.hangerVelocity))<.00001);
 for(let i=0;i<6;i++)s.step(1);assert.equal(s.countdown,0);assert.ok(Math.abs(s.time-300.1)<.0001);assert.ok(Math.abs(s.runners[0].y-10.01)<.00001);
 s.step(1/60,{throttle:1});assert.ok(s.runners[0].speed>0);
});

test('entrance float clocks hold controls through 420 updates at sixty hertz and restore spawn headings',()=>{
 let s=new Simulation(),before=s.runners.map(r=>({...r}));beginEntrance(s);assert.equal(s.entrance.height,38);assert.ok(s.runners.every(r=>r.y>48));let stages=new Set();
 for(let i=0;i<419;i++){s.step(1/60,{throttle:1,fire:true});stages.add(s.entrance.cameraStage);assert.equal(s.entrance.active,true)}
 assert.deepEqual([...stages],[1,2]);assert.equal(s.projectiles.length,0);assert.ok(s.entrance.yawDegrees>359);s.step(1/60);assert.equal(s.countdown,0);assert.equal(s.entrance.active,false);assert.equal(s.entrance.height,0);assert.equal(s.entrance.yawDegrees,0);
 s.runners.forEach((r,i)=>{assert.ok(Math.abs(r.x-before[i].x)<.000001);assert.ok(Math.abs(r.z-before[i].z)<.000001);assert.ok(Math.abs(r.yaw-before[i].yaw)<.000001)});
 assert.ok(Math.abs(s.entrance.camera.y-s.runners[0].y-3.5)<.000001);s.step(1/60,{throttle:1});assert.ok(s.runners[0].speed>0);
});
