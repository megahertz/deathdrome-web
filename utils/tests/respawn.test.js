import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation} from '../../src/simulation.js';
import {RESPAWN,beginRespawn,stepRespawn,cancelRespawn,runnerBodyVisible} from '../../src/respawn.js';

test('respawn thresholds and original shroud scale/scroll match executable and script data',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),code=va=>va-0x410000+0x400,script=await readFile(new URL('../../private/original/game/RUN/SHROUD.GW',import.meta.url),'utf8');
 assert.equal(RESPAWN.delaySeconds,exe.readFloatLE(code(0x42b307)));assert.equal(RESPAWN.energizeSeconds,exe.readFloatLE(code(0x42b1b6)));assert.equal(RESPAWN.bodyAtSeconds,exe.readFloatLE(code(0x42b20b)));
 let scale=script.match(/^Object3DScale\s+([.\d]+)/m),scroll=script.match(/^Object3DSetScroll on\s+([.\d-]+)\s+([.\d-]+)/m);assert.equal(RESPAWN.shroudScale,Math.fround(Number(scale[1])));assert.deepEqual(RESPAWN.scroll,scroll.slice(1).map(x=>Math.fround(Number(x))));
 let model=JSON.parse(await readFile(new URL('../../private/assets/models/plas_hit.json',import.meta.url)));assert.ok(model.meshes.length>0);assert.ok(model.meshes.every(f=>f.name.includes('/o170/')));assert.equal(RESPAWN.model,'plas_hit');
});
function setup(){let sim=new Simulation({ground:()=>10});sim.countdown=0;sim.runners.forEach(r=>r.dead=Infinity);let r=sim.runners[0];r.health=0;beginRespawn(sim,r);return {sim,r}}
test('strict delay starts the original half-second shroud phase and clears the phase accumulator',()=>{
 let {sim,r}=setup();stepRespawn(sim,r,.25);assert.equal(r.respawn.phase,'delay');assert.equal(r.respawn.shroudVisible,false);stepRespawn(sim,r,.001);assert.equal(r.respawn.phase,'energize');assert.equal(r.respawn.elapsed,0);assert.equal(r.respawn.shroudVisible,true);assert.equal(runnerBodyVisible(r),false);
});
test('float-stored energize updates reveal the body before restoring controls and health',()=>{
 let {sim,r}=setup();stepRespawn(sim,r,.26);for(let i=0;i<26;i++)stepRespawn(sim,r,1/60);assert.equal(runnerBodyVisible(r),false);stepRespawn(sim,r,1/60);
 assert.equal(runnerBodyVisible(r),true);assert.equal(r.respawn.shroudVisible,true);assert.equal(r.health,0);assert.equal(r.dead,Infinity);assert.equal(sim.damage(r,100,1),false);
 for(let i=0;i<3;i++)stepRespawn(sim,r,1/60);assert.equal(r.respawn,null);assert.equal(r.dead,0);assert.equal(r.health,100);assert.equal(r.shield,0);assert.equal(runnerBodyVisible(r),true);
});
test('respawn freezes movement, weapons and jump until normal runner setup completes',()=>{
 let {sim,r}=setup(),pose={x:r.x,y:r.y,z:r.z,yaw:r.yaw};for(let i=0;i<45;i++)sim.step(1/60,{throttle:1,steer:1,fire:true,jump:true});
 assert.ok(r.respawn);assert.equal(sim.projectiles.length,0);assert.deepEqual({x:r.x,y:r.y,z:r.z,yaw:r.yaw},pose);assert.equal(r.speed,0);assert.equal(r.vy,0);sim.step(1/60,{throttle:1});assert.equal(r.respawn,null);assert.equal(r.speed,0);sim.step(1/60,{throttle:1});assert.ok(r.speed>0);
});
test('AI replacement route reservations transfer once to the normal controller and cancellation releases them',async()=>{
 let paths=JSON.parse(await readFile(new URL('../../private/assets/ai-paths.json',import.meta.url))),sim=new Simulation({round:3,paths:paths[0]}),next=sim.population.replace(sim.runners[1]);
 assert.equal(next.respawn.routeIndex,1);assert.deepEqual(sim.aiRouteCounts,[0,1,0,1,2]);for(let i=0;i<46;i++)stepRespawn(sim,next,1/60);
 assert.equal(next.respawn,null);assert.equal(next.navigation.routeIndex,1);assert.deepEqual(sim.aiRouteCounts,[0,1,0,1,2]);
 next=sim.population.replace(sim.runners[2]);let index=next.respawn.routeIndex,before=sim.aiRouteCounts[index];cancelRespawn(sim,next);assert.equal(sim.aiRouteCounts[index],before-1);assert.equal(next.respawn,null);
});
test('life loss and final game-over wait for the destruction callback rather than damage time',()=>{
 let sim=new Simulation();sim.countdown=0;sim.ai=()=>({});sim.lives=1;let r=sim.runners[0];sim.damage(r,10000,1);assert.equal(sim.phase,'running');assert.equal(sim.lives,1);assert.equal(r.dead,0);sim.step(1/60);assert.ok(r.dead>0);
 for(let i=0;i<149;i++)sim.step(1/60);assert.equal(sim.lives,1);assert.equal(sim.phase,'running');sim.step(1/60);sim.step(1/60);assert.equal(sim.lives,0);assert.equal(sim.phase,'gameover');assert.equal(r.respawn,null);assert.equal(r.dead,Infinity);assert.equal(sim.events.filter(e=>e.type==='lifeLost').length,1);
});
