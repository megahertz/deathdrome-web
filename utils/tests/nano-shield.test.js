import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation,RUNNERS} from '../../src/simulation.js';
import {NANO,activateShield,stepShield} from '../../src/nano-shield.js';
test('NanoShield timer and oscillator speed match the executable activation routine',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),code=va=>va-0x410000+0x400;
 assert.equal(NANO.timer,exe.readFloatLE(code(0x440643)));assert.equal(NANO.speed,exe.readFloatLE(code(0x4405a8)));assert.equal(NANO.minimumZ,exe.readFloatLE(code(0x4405d5)));
 assert.equal(exe.readUInt32LE(code(0x42f92a)),0x158);assert.equal(exe.readUInt32LE(code(0x44073d)),0x158);
});
test('NanoShield oscillates between native bounds and its two timer updates give 7.5 seconds',()=>{
 let r={};activateShield(r);assert.equal(r.shield,NANO.timer/NANO.timerUpdatesPerFrame);assert.deepEqual(r.shieldPlanes.map(p=>p.z),[-8,0]);
 for(let i=0;i<60;i++)stepShield(r,1/60);
 assert.ok(Math.abs(r.shield-6.5)<.000001);for(let p of r.shieldPlanes)assert.ok(p.z>=-8&&p.z<=1);
 stepShield(r,6.51);assert.equal(r.shield,0);assert.equal(r.shieldPlanes,null);
});
test('NanoShield mounts use exported cockpit transforms for all original runners',async()=>{
 for(let name of RUNNERS){let model=JSON.parse(await readFile(new URL('../../private/assets/models/'+name+'.json',import.meta.url)));assert.equal(model.attachments.cockpit.matrix.length,16);assert.ok(model.attachments.cockpit.matrix.every(Number.isFinite))}
});
test('runners spawn without an invented shield; a shield pickup blocks damage until expiry',()=>{
 let s=new Simulation(),r=s.runners[0];s.countdown=0;assert.equal(r.shield,0);s.collect(r,{type:'enh_nano.gam'});s.cycleWeapon(r);s.secondary(r);
 s.damage(r,100,1);assert.equal(r.health,100);assert.ok(r.shieldPlanes);stepShield(r,7.6);s.damage(r,100,1);assert.ok(r.health<100);
});
