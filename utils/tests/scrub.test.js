import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Scrub} from '../../src/scrub.js';
import {Simulation} from '../../src/simulation.js';
import {GAME_TABLES} from '../../src/game-tables.js';
test('the exported scrub includes all 32 original instance references',async()=>{
 let data=JSON.parse(await readFile(new URL('../../private/assets/models/scrub.json',import.meta.url)));
 assert.equal(data.instanceDefinitions,1);assert.equal(data.instanceReferences,32);assert.equal(data.meshes.length,96);
 let vertices=data.meshes.flatMap(m=>m.v);for(let axis of [0,2]){assert.ok(Math.min(...vertices.map(v=>v[axis]))< -990);assert.ok(Math.max(...vertices.map(v=>v[axis]))>990)}
 assert.ok(data.meshes.every(m=>m.cycle?.frames.length===3));
});
test('scrub growth and contraction constants match the supplied executable',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),at=v=>v-0x480000+0x68e00;
 assert.equal(GAME_TABLES.scrub.contractionRate,exe.readFloatLE(at(0x484a4e)));
 assert.equal(GAME_TABLES.scrub.heightGrowth,exe.readFloatLE(at(0x484a56)));
 assert.equal(GAME_TABLES.scrub.finishScale,exe.readDoubleLE(at(0x484a62)));
 let s=new Scrub();s.start();let duration=0;while(!s.finished&&duration<60){s.step(1/60);duration+=1/60}
 assert.ok(duration>38&&duration<40);assert.equal(s.reaches({x:0,y:0,z:0}),true);
});
test('scrub ends the run despite a shield and unused runner credits',()=>{
 let s=new Simulation();s.countdown=0;s.time=0;s.ai=()=>({});let p=s.runners[0];Object.assign(p,{x:700,z:700,y:0,shield:100});s.step(1/60);
 assert.equal(s.phase,'gameover');assert.equal(p.health,0);assert.equal(s.lives,3);assert.ok(s.events.some(e=>e.type==='gameover'&&e.reason==='Scrub'));
});
