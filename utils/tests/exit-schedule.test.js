import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation} from '../../src/simulation.js';

// Historical native fixture supplies no-op physics; its timer branch is excluded.
function fixture(f,stubPhysical=false){
 let events=[];
 const record=(phase,r)=>events.push({phase,runner:r.id,active:!r.dead&&!r.inactive,controls:r.controlsEnabled!==false});
 const sim=new Simulation({player:f.player,maximumRunners:8,ground:()=>0,blocked:()=>false,wallContact(r){record('physics',r);return null}});
 if(stubPhysical)sim.stepRunnerControlDisable=()=>{};
 sim.countdown=0;sim.time=35+f.dt;sim.requiredKills=2;sim.population.nextInactive=()=>null;sim.projectileContact=()=>{};
 sim.ai=r=>{record('controller',r);return {}};
 const mask=f.mask|(1<<f.player);
 for(const r of sim.runners){
  Object.assign(r,{dead:mask&(1<<r.id)?0:Infinity,inactive:!(mask&(1<<r.id)),x:r.id===f.player?0:100+r.id*30,y:0,z:r.id===f.player?0:100,yaw:0,speed:0,kills:r.id===f.player?2:0,weapons:f.missile?[null,'Missile']:[null],weaponCells:[4,1,0,0],selectedWeapon:f.missile?1:0});
  sim.selectWeapon(r);if(!r.dead)sim.fire(r,f.missile);
 }
 const weapons=sim.stepRunnerWeapons.bind(sim),health=sim.checkRunnerHealth.bind(sim);
 sim.stepRunnerWeapons=(r,dt,o)=>{record('weapons',r);weapons(r,dt,o)};
 sim.checkRunnerHealth=(r,o)=>{record('health',r);return health(r,o)};
 const trace=[];
 for(let frame=0;frame<3;frame++){
  events=[];sim.step(f.dt);
  // Human input sampling is supplied to both implementations. Record that
  // supplied callback at its model position, just before physical dispatch.
  if(frame===0){const i=events.findIndex(e=>e.runner>=f.player);events.splice(i,0,{phase:'controller',runner:f.player,active:true,controls:true})}
  trace.push({events,entered:!!sim.escape,active:sim.runners.map(r=>!r.dead&&!r.inactive),controls:sim.runners.map(r=>r.controlsEnabled!==false),slots:sim.runners.map(r=>sim.projectiles.filter(p=>p.owner===r.id&&p.life>0).sort((a,b)=>a.slot-b.slot).map(p=>({slot:p.slot,age:p.age})))});
 }
 return trace;
}

test('surrounding actors continue through human exit in 96 original model-loop traces',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../../private/verification/exit-schedule-native-audit.json',import.meta.url)));
 for(let i=0;i<audit.fixtures.length;i++)assert.deepEqual(fixture(audit.fixtures[i],true),audit.native[i],JSON.stringify(audit.fixtures[i]));
});

test('real exit physics and model sequencing match 96 native three-loop traces',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../../private/verification/exit-physical-schedule-native-audit.json',import.meta.url)));
 for(let i=0;i<audit.fixtures.length;i++)assert.deepEqual(fixture(audit.fixtures[i]),audit.native[i],JSON.stringify(audit.fixtures[i]));
});

test('human exit advances surrounding physics, effects and replacement while preserving its retired pool',()=>{
 const s=new Simulation({player:4,maximumRunners:8,ground:()=>0,blocked:()=>false,wallContact:()=>null});s.countdown=0;s.time=70;s.ai=()=>({});
 s.runners.forEach(r=>{r.dead=Infinity;r.inactive=true});
 const p=s.runners[4],before=s.runners[2],after=s.runners[6],dying=s.runners[1];
 for(const r of [p,before,after,dying])Object.assign(r,{dead:0,inactive:false,x:r===p?0:100+r.id*30,y:0,z:r===p?0:100,yaw:0,speed:r===p?0:30,acceleration:r===p?0:20,kills:r===p?s.requiredKills:0});
 s.fire(p);s.fire(before);s.fire(after);s.damage(dying,10000,2);
 s.collect(before,{type:'enh_shok.gam'});s.cycleWeapon(before);s.secondary(before);const wave=s.projectiles.find(p=>p.kind==='ShockWave');
 s.pickups.push({id:0,type:'enh_lock',x:600,y:0,z:600,cooldown:10});
 s.step(1/60);assert.equal(s.phase,'exiting');assert.ok(dying.dead>0);assert.ok(before.z<100&&after.z<100);assert.ok(wave.scale>0);
 const retired=s.projectiles.filter(q=>q.owner===p.id),frozen=structuredClone(retired),z=after.z,age=s.projectiles.find(q=>q.owner===after.id).age,scale=wave.scale,time=s.time,elapsed=s.elapsed;
 for(let i=0;i<10;i++)s.step(1/60,{fire:true,throttle:1});
 assert.ok(after.z<z);assert.ok(s.projectiles.find(q=>q.owner===after.id).age>age);assert.ok(wave.scale>scale);assert.ok(s.pickups[0].cooldown<10);assert.deepEqual(retired,frozen);
 assert.ok(Math.abs(s.time-(time-10/60))<1e-10);assert.ok(Math.abs(s.elapsed-(elapsed+10/60))<1e-10);assert.equal(after.controlsEnabled,true);
 for(let i=0;i<195;i++)s.step(1/60);
 assert.equal(s.phase,'exiting');assert.equal(dying.inactive,true);assert.equal(s.runners[0].respawn,null);assert.equal(s.runners[0].health,100);assert.equal(s.runners[0].controlsEnabled,true);assert.ok(s.events.every(e=>e.type!=='gameover'));
});
