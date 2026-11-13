import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation} from '../../src/simulation.js';
import {SECONDARY,acquireIonTarget,stepSecondaryProjectile,stepIon} from '../../src/secondary.js';
const setup=()=>{let s=new Simulation();s.countdown=0;s.ai=()=>({});for(let r of s.runners)Object.assign(r,{x:500+r.id*10,y:0,z:500,shield:0});Object.assign(s.runners[0],{x:100,z:100,yaw:0});return s};
const equip=(s,type)=>{let r=s.runners[0];s.collect(r,{type});s.cycleWeapon(r);r.fire=0;s.secondary(r)};
test('secondary weapon constants are read from the original executable',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),f=va=>exe.readFloatLE(va-0x480000+0x68e00);
 assert.equal(SECONDARY.shockWave.growth,f(0x480d93));assert.equal(SECONDARY.shockWave.verticalBand,f(0x480d8b));
 assert.equal(SECONDARY.disruptor.baseSpeed,f(0x485774));assert.equal(SECONDARY.disruptor.growth,f(0x485778));assert.equal(SECONDARY.disruptor.launchDistance,f(0x48577c));
 assert.equal(SECONDARY.ionSword.damagePerSecond,-f(0x48579c));assert.equal(SECONDARY.ionSword.verticalBand,f(0x485790));
});
test('shockwave expands over time, rejects vertical separation, and preserves shield contact scoring',()=>{
 let s=setup(),p=s.runners[0];Object.assign(s.runners[1],{x:150,z:100,shield:8});Object.assign(s.runners[2],{x:150,z:100});Object.assign(s.runners[3],{x:150,y:.251,z:100});
 equip(s,'enh_shok.gam');let wave=s.projectiles[0];assert.equal(p.kills,0);assert.equal(p.weapon,null);
 stepSecondaryProjectile(s,wave,.1);assert.equal(s.runners[2].health,100);
 stepSecondaryProjectile(s,wave,.2);assert.equal(s.runners[1].health,100);assert.equal(s.runners[2].health,0);assert.equal(s.runners[3].health,100);assert.equal(p.kills,1);assert.equal(s.score,1000);
 s.checkRunnerHealth(s.runners[2]);stepSecondaryProjectile(s,wave,.2);assert.equal(s.score,1500);assert.equal(wave.scale,30);
 stepSecondaryProjectile(s,wave,.51);assert.ok(wave.life<=0);
});
test('an active Disruptor rejects another launch without consuming the second slot',()=>{
 let s=setup(),r=s.runners[0];s.collect(r,{type:'enh_disr.gam'});s.collect(r,{type:'enh_disr.gam'});s.cycleWeapon(r);s.secondary(r);
 let projectile=s.projectiles[0];assert.equal(projectile.z,87);assert.equal(projectile.speed,50);assert.deepEqual(r.weapons,[null,'Disruptor']);
 r.fire=0;s.cycleWeapon(r);s.secondary(r);assert.equal(s.projectiles.length,1);assert.deepEqual(r.weapons,[null,'Disruptor']);
});
test('Disruptor grows, crosses walls and disables an unshielded runner once for eight seconds',()=>{
 let s=setup();s.blocked=()=>true;Object.assign(s.runners[1],{x:100,z:62});Object.assign(s.runners[2],{x:100,z:62,shield:5});
 equip(s,'enh_disr.gam');let p=s.projectiles[0];stepSecondaryProjectile(s,p,.5);
 assert.equal(p.z,62);assert.equal(p.scale,13.5);assert.equal(s.runners[1].disrupted,8);assert.equal(s.runners[2].disrupted,0);assert.equal(s.score,500);
 stepSecondaryProjectile(s,p,.01);assert.equal(s.score,500);assert.ok(p.life>0);
});
test('Ion Sword selects a forward target, drains without armor, scores a kill and expires',()=>{
 let s=setup(),r=s.runners[0],q=s.runners[1];Object.assign(q,{x:100,z:50,health:30});Object.assign(s.runners[2],{x:100,z:125});Object.assign(s.runners[3],{x:100,y:11,z:90});
 assert.equal(acquireIonTarget(s,r),1);equip(s,'enh_ion.gam');stepIon(s,r,.5);
 assert.ok(Math.abs(q.health-16.25)<.00001);assert.equal(r.ionTarget,1);assert.equal(s.score,0);
 stepIon(s,r,.6);assert.equal(q.health,0);assert.equal(r.kills,1);assert.equal(s.score,600);assert.equal(r.ionTarget,null);
 stepIon(s,r,3);assert.equal(r.ionSeconds,0);
});
test('Ion Sword keeps an acquired target beyond acquisition range but releases it behind the runner',()=>{
 let s=setup(),r=s.runners[0],q=s.runners[1];Object.assign(q,{x:100,z:50});equip(s,'enh_ion.gam');stepIon(s,r,.01);q.z=-200;stepIon(s,r,.01);assert.equal(r.ionTarget,1);q.z=150;stepIon(s,r,.01);assert.equal(r.ionTarget,null);
});
