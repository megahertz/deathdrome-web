import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hudCommands,notificationLayout,barrierGauge} from '../../src/hud.js';
import {resultAdvance,resultContinuation,resultLabels} from '../../src/round-results.js';
import {projectRadar} from '../../src/hud-radar.js';
import {stepHudWarning,playerIsLocked} from '../../src/hud-warning.js';
import {projectReticle} from '../../src/hud-reticle.js';
import {View,THREE} from '../../src/renderer.js';

test('HUD text, frame and life positions agree with captured original display records',async()=>{
 const native=JSON.parse(await readFile(new URL('../../private/verification/hud-layout-native.json',import.meta.url))).modes['0'];
 const sim={player:0,arena:1,round:1,score:0,lives:3,time:296.2,requiredKills:2,runners:Array.from({length:5},(_,id)=>({id,health:98,kills:0,weapons:[null],selectedWeapon:0,zoneMask:1}))},commands=hudCommands(sim,0);
 for(const record of native.filter(r=>r.kind===4))assert.ok(commands.some(c=>c.kind==='text'&&c.x===record.x&&c.y===record.y&&c.value===record.text.replaceAll('*',':')),JSON.stringify(record));
 const assets={290:'hud_bot',409:'hud_top',686:'hud_t_l',684:'hud_b_l',685:'hud_t_r',683:'hud_b_r',408:'hudlcr_h',687:'hudlcr_l'};
 for(const record of native.filter(r=>assets[r.image]))assert.ok(commands.some(c=>c.kind==='image'&&c.name===assets[record.image]&&c.x===record.x&&c.y===record.y),JSON.stringify(record));
});
test('HUD preserves field boundaries for singular kills, quota, inventories and life counts',()=>{
 const sim={score:123456,lives:7,time:60,requiredKills:2,runners:[{id:0,health:.9,kills:1,weapons:[null,'Missile','Ion Sword'],selectedWeapon:2}]};let commands=hudCommands(sim,0);
 assert.ok(commands.some(c=>c.value==='1 KILL LEFT'));assert.ok(commands.some(c=>c.value==='1 KILL'));assert.ok(commands.some(c=>c.value==='0'&&c.x===148));
 assert.equal(commands.filter(c=>c.name==='hudlcr_h').length,6);assert.ok(commands.some(c=>c.name==='hud_is_h'&&c.x===84));
 sim.runners[0].kills=2;assert.ok(hudCommands(sim,0).some(c=>c.value==='ADVANCE'));
});
test('one, two and three notifications follow the original centered four-second queue',async()=>{
 const native=JSON.parse(await readFile(new URL('../../private/verification/hud-layout-native.json',import.meta.url))).notifications;
 for(const rows of native){const commands=notificationLayout(rows.map(r=>({text:r.text.toUpperCase(),until:r.seconds})),0);assert.deepEqual(commands.map(r=>[r.x,r.y]),rows.map(r=>[r.x,r.y]));assert.equal(notificationLayout(commands,4).length,0)}
});
test('barrier gauge follows original capacity and retraction fields independently of health or laser slots',async()=>{
 const native=JSON.parse(await readFile(new URL('../../private/verification/hud-layout-native.json',import.meta.url))).barrierMeter;
 for(const sample of native)assert.equal(barrierGauge({...sample,points:Array(sample.count+1)}),sample.width,JSON.stringify(sample));
});
test('all eight X/Y/Z key combinations match original HUD rectangles and palette entries',async()=>{
 const native=JSON.parse(await readFile(new URL('../../private/verification/hud-layout-native.json',import.meta.url))).keys;
 for(const sample of native){const r={id:0,kills:0,health:100,weapons:[null],keyring:Object.fromEntries(['x','y','z'].map((k,i)=>[k,!!((sample.bits>>i)&1)]))},commands=hudCommands({score:0,time:300,lives:3,requiredKills:2,runners:[r]},0).filter(c=>c.kind==='rect').map(({kind,...rect})=>rect);assert.deepEqual(commands,sample.rects)}
});
test('radar projection, cardinal rounding and edge precedence match 216 original actions',async()=>{
 const audit=JSON.parse(await readFile(new URL('../../private/verification/hud-radar-native.json',import.meta.url)));assert.equal(audit.passed,true);audit.fixtures.forEach((f,i)=>assert.deepEqual(projectRadar(f.origin,f.target,f.forward),audit.native[i]));
});
test('warning health threshold, shared-lock precedence and blink timer match 180 original actions',async()=>{
 const audit=JSON.parse(await readFile(new URL('../../private/verification/hud-warning-native.json',import.meta.url)));assert.equal(audit.passed,true);audit.fixtures.forEach((f,i)=>{const state={active:f.active,timer:f.timer},result=stepHudWarning(state,f,f.dt);assert.deepEqual({active:state.active,timer:state.timer,message:result.started?state.message:null,shade:state.shade??null,clear:result.clear},audit.native[i])});
 const sim={runners:[{id:0},{id:1,missileLockTarget:0},{id:2,missileLockTarget:0,inactive:true}]};assert.equal(playerIsLocked(sim,0),true);sim.runners[1].dead=1;assert.equal(playerIsLocked(sim,0),false);
});
test('lock reticle projection and viewport clamping match 200 original actions',async()=>{
 const audit=JSON.parse(await readFile(new URL('../../private/verification/hud-reticle-native.json',import.meta.url)));assert.equal(audit.passed,true);
 audit.fixtures.forEach((f,i)=>assert.deepEqual(projectReticle(f.point,f.options),audit.native[i]));
});
test('world lock reticle follows the current camera pose without waiting for the scene draw',()=>{
 const camera=new THREE.PerspectiveCamera(35,1.6,.75,1200);camera.position.set(10,8,20);camera.lookAt(10,8,-80);const view={camera};
 assert.deepEqual(View.prototype.hudReticle.call(view,{x:10,y:8,z:-80}),{x:156,y:82,width:8,height:8});
 assert.equal(View.prototype.hudReticle.call(view,{x:10010,y:8,z:-80}).x,310);
 camera.position.x=10010;assert.equal(View.prototype.hudReticle.call(view,{x:10010,y:8,z:-80}).x,156);assert.equal(View.prototype.hudReticle.call(view,null),null);
});
test('results continuation accepts any fresh key, ignores repeats and advances only once',()=>{
 for(const code of ['KeyW','KeyA','AltLeft','ShiftLeft','Escape','Space','Enter']){let calls=0,advance=resultAdvance(()=>calls++);assert.equal(advance({code,repeat:true}),false);assert.equal(calls,0);assert.equal(advance({code,repeat:false}),true);assert.equal(advance({code,repeat:false}),false);assert.equal(advance(),false);assert.equal(calls,1)}
 let calls=0;assert.equal(resultAdvance(()=>calls++)(),true);assert.equal(calls,1);
 assert.deepEqual(resultContinuation({win:true,arena:1,round:1}),{kind:'round',arena:1,round:2});assert.deepEqual(resultContinuation({win:true,arena:1,round:3}),{kind:'domain',arena:2,round:1});assert.deepEqual(resultContinuation({win:true,arena:8,round:3}),{kind:'freedom'});assert.deepEqual(resultContinuation({win:false,arena:1,round:1}),{kind:'menu'});
 const labels=resultLabels({arena:1,round:1,player:0,score:8630,roundBonus:{kills:2000,time:1330,credits:0}});assert.ok(labels.some(l=>l.value==='2000'&&l.x===225&&l.y===65));assert.ok(labels.some(l=>l.value==='8630'&&l.y===175));
});
