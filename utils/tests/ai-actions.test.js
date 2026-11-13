import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation,DYNAMICS} from '../../src/simulation.js';
import {GAME_TABLES} from '../../src/game-tables.js';
import {AI_ACTIONS,AI_ATTACK,resetAI,acquireAITarget,chooseAIEnhancer,stepAITarget,stepAIActions,stepAIAttack,aiClock} from '../../src/ai-actions.js';
import {stepRunnerProjectiles} from '../../src/projectiles.js';
import {updateDrive} from '../../src/drive.js';
import {playerIsLocked,stepHudWarning} from '../../src/hud-warning.js';
import {WEAPON_NAMES,weaponCode} from '../../src/inventory.js';

test('native random generator reproduces the executable multiply, add and 15-bit extraction',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),at=va=>va-0x410000+0x400;
 assert.equal(GAME_TABLES.random.multiplier,exe.readUInt32LE(at(0x45a8f2)));
 assert.equal(GAME_TABLES.random.increment,exe.readUInt32LE(at(0x45a8f8)));
 assert.equal(GAME_TABLES.random.mask,exe.readUInt32LE(at(0x45a904)));
 let s=new Simulation();s.seed=1996;assert.deepEqual(Array.from({length:5},()=>s.randomInt()),[22059,24488,31583,12555,15145]);
});

test('AI target acquisition follows ID order, height, radius, visibility and the native x/y exclusion',()=>{
 let s=new Simulation();s.runners.forEach(r=>Object.assign(r,{dead:0,x:500,y:0,z:500}));let r=s.runners[3];Object.assign(r,{x:100,y:0,z:0});
 Object.assign(s.runners[0],{x:0,y:0,z:0});Object.assign(s.runners[1],{x:200,y:0,z:0});Object.assign(s.runners[2],{x:105,y:0,z:0});let level={radiusSquared:10000};
 assert.equal(acquireAITarget(s,r,level).id,1);s.runners[1].y=5.01;assert.equal(acquireAITarget(s,r,level).id,2);
 s.blocked=(_,q)=>q.id===2;assert.equal(acquireAITarget(s,r,level),undefined);s.blocked=()=>false;s.runners[2].dead=1;assert.equal(acquireAITarget(s,r,level),undefined);
});

test('AI attack windows expire and recover before acquiring another target',()=>{
 let s=new Simulation();s.countdown=0;s.elapsed=14;s.runners.forEach(r=>r.dead=Infinity);let r=s.runners[1],q=s.runners[0];Object.assign(r,{dead:0,x:100,y:0,z:0});Object.assign(q,{dead:0,x:110,y:0,z:0});
 let level=GAME_TABLES.ai.levels[0];assert.equal(stepAITarget(s,r,level),q);let until=r.aiState.attackUntil;
 s.elapsed=until-7;assert.equal(stepAITarget(s,r,level),null);assert.equal(r.aiState.mode,'recover');
 s.elapsed+=AI_ACTIONS.recoverySeconds-.01;assert.equal(stepAITarget(s,r,level),null);s.elapsed+=.02;assert.equal(stepAITarget(s,r,level),q);
});

test('AI enhancer choice re-rolls ShockWave once and skips it while walking native inventory IDs',()=>{
 let values=[2,4],s={randomInt:()=>values.shift()},r={weapons:[null]};assert.equal(chooseAIEnhancer(s,r),'Missile');
 values=[1];r={weapons:[null,'Missile']};assert.equal(chooseAIEnhancer(s,r),'Disruptor');
 values=[2,2];r={weapons:[null]};assert.equal(chooseAIEnhancer(s,r),'ShockWave');
 values=[0];r={weapons:[null,'Missile','Disruptor']};assert.equal(chooseAIEnhancer(s,r),'Ion Sword');
});

test('AI initial action delays include the entrance and periodic actions use source timers',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),at=va=>va-0x480000+0x68e00;
 assert.equal(AI_ACTIONS.initialEnhancerDelay,exe.readFloatLE(at(0x483e1f)));assert.equal(AI_ACTIONS.initialActionDelay,exe.readFloatLE(at(0x483e23)));assert.equal(AI_ACTIONS.barrierWindowSeconds,exe.readDoubleLE(at(0x483dd3)));
 let s=new Simulation(),r=s.runners[1],level=GAME_TABLES.ai.levels[0];s.randomInt=()=>0;resetAI(s,r);assert.equal(aiClock(s),0);assert.equal(r.aiState.enhancerAt,30);s.countdown=0;assert.equal(aiClock(s),7);
 s.elapsed=9;assert.equal(stepAIActions(s,r,level).barrier,false);s.elapsed=13;let a=stepAIActions(s,r,level);assert.equal(a.barrier,true);assert.equal(a.jump,true);assert.equal(r.aiState.barrierAt,20);
 s.elapsed=17;assert.equal(stepAIActions(s,r,level).barrier,false);assert.equal(r.aiState.barrierAt,29);
 s.elapsed=23;stepAIActions(s,r,level);assert.deepEqual(r.weapons,[null,'Missile']);assert.equal(r.aiState.enhancerAt,30);
});

test('AI shooting switches and attack thresholds match executable data',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),at=va=>va-0x480000+0x68e00;
 assert.deepEqual(GAME_TABLES.ai.levels.map(l=>l.shootEnabled),Array(8).fill(exe.readUInt32LE(at(0x48f00c))!==0));
 assert.deepEqual(GAME_TABLES.ai.levels.map(l=>l.barrierJumpEnabled),Array.from({length:8},(_,i)=>exe.readFloatLE(at(0x48f0c0)+i*4)>0));
 for(let [name,va] of Object.entries({slowTargetSpeed:0x483de7,maximumShotDistanceSquared:0x483def,minimumShotDistanceSquared:0x483e03,shotAlignment:0x483dff,brakeAlignmentCross:0x483df3,reverseDistanceSquared:0x483df7,missileDelay:0x483dfb}))assert.equal(AI_ATTACK[name],exe.readFloatLE(at(va)));
});

function attackSetup(){let s=new Simulation({ground:()=>0}),r=s.runners[1],q=s.runners[0];s.countdown=0;s.elapsed=15;Object.assign(r,{x:100,y:0,z:100,yaw:0,movementEnabled:true,speed:30,acceleration:100,aiContact:{clear:true}});Object.assign(q,{x:100,y:0,z:50,speed:30});r.aiState.shotAt=0;r.aiState.previousDirection={x:0,z:-1};return {s,r,q}}
test('attack steering tracks target direction changes and feeds rates directly into dynamics',()=>{
 let {s,r,q}=attackSetup(),level=GAME_TABLES.ai.levels[0];q.x=50;q.z=100;
 let first=stepAIAttack(s,r,q,level);assert.ok(Math.abs(first.turn)<1e-6,'initial target change cancels the steering error');
 let rates=stepAIAttack(s,r,q,level);assert.ok(Math.abs(rates.turn-185*Math.PI/180)<1e-6);
 r.floor=0;updateDrive(r,{driveRates:rates},1/60,DYNAMICS);assert.ok(r.yaw>0);assert.equal(r.acceleration,100);assert.ok(r.speed>30);
});
test('AI stops accelerating for a slow crossing target and reverses at close distance',()=>{
 let {s,r,q}=attackSetup(),level=GAME_TABLES.ai.levels[0];Object.assign(q,{x:140,z:100,speed:0});assert.equal(stepAIAttack(s,r,q,level).acceleration,0);
 Object.assign(q,{x:100,z:80});let rates=stepAIAttack(s,r,q,level);assert.equal(rates.acceleration,-100);updateDrive(r,{driveRates:rates},1/60,DYNAMICS);assert.equal(r.acceleration,Math.fround(-100*GAME_TABLES.drive.reverseAccelerationFactor));assert.ok(r.speed<30);
});
test('attack firing honors enabled levels, strict range/alignment boundaries and scene visibility',()=>{
 for(const level of GAME_TABLES.ai.levels){const {s,r,q}=attackSetup();stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,2,'every original aggression level may shoot')}
 let {s,r,q}=attackSetup();stepAIAttack(s,r,q,{...GAME_TABLES.ai.levels[0],shootEnabled:false});assert.equal(s.projectiles.length,0);
 let level=GAME_TABLES.ai.levels[3];for(let pose of [{x:100,z:0},{x:100,z:90},{x:150,z:100}]){Object.assign(q,pose);stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,0)}
 Object.assign(q,{x:100,z:50});s.blocked=()=>true;stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,0);s.blocked=()=>false;stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,2);
 stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,2);s.elapsed+=level.shotSeconds+.01;stepAIAttack(s,r,q,level);assert.equal(s.projectiles.length,4);
});
test('AI cycles after each shot and missile delay follows the newly selected inventory slot',()=>{
 let {s,r,q}=attackSetup(),level=GAME_TABLES.ai.levels[3];r.weapons=[null,'Missile','ShockWave'];stepAIAttack(s,r,q,level);
 assert.equal(r.weapon,'Missile');assert.equal(r.aiState.shotAt,Math.fround(Math.fround(aiClock(s)+level.shotSeconds)+3));assert.equal(s.projectiles[0].kind,'Laser');
 s.elapsed=r.aiState.shotAt-7+.01;stepAIAttack(s,r,q,level);assert.deepEqual(r.weapons,[null,'Missile','ShockWave']);assert.equal(r.weapon,'Missile');assert.equal(s.projectiles.at(-1).kind,'Missile');assert.equal(r.aiState.shotAt,Math.fround(Math.fround(aiClock(s)+level.shotSeconds)+3));stepRunnerProjectiles(s,r,1/60);assert.deepEqual(r.weapons,[null,'ShockWave']);assert.equal(r.weapon,null);
});


test('all aggression levels, weapon slots, firing toggle and range gates match 336 original attack actions',async()=>{
 const report=JSON.parse(await readFile(new URL('../../private/verification/ai-firing-native.json',import.meta.url)));
 assert.equal(report.passed,true);assert.equal(report.cases,336);
 for(const [i,f]of report.fixtures.entries()){
  const {s,r,q}=attackSetup(),shots=[];s.elapsed=0;r.weapons=f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]);r.weaponCells=[...f.cells];r.selectedWeapon=f.selected;s.selectWeapon(r);Object.assign(q,{x:f.target[0],z:f.target[1]});s.sceneContacts=()=>[];s.lineBlocked=()=>f.variant==='remote-wall';s.fire=()=>shots.push(4);s.secondary=()=>shots.push(weaponCode(r.weapon));
  stepAIAttack(s,r,q,{...GAME_TABLES.ai.levels[f.level],shootEnabled:f.variant!=='disabled'});
  assert.deepEqual({shots,selected:r.selectedWeapon,shotAt:r.aiState.shotAt},report.native[i]);
 }
});

test('first-domain bots select collected missiles, lock the player, trigger the HUD warning and launch the missile',()=>{
 const {s,r,q}=attackSetup();s.runners.forEach(other=>{if(other!==r&&other!==q)other.dead=Infinity});
 const pickup={type:'enh_lock.gam'};assert.equal(s.collect(r,pickup),true);assert.deepEqual(r.weapons,[null,'Missile']);
 const level=GAME_TABLES.ai.levels[0];stepAIAttack(s,r,q,level);stepRunnerProjectiles(s,r,1/60);
 assert.equal(r.weapon,'Missile');assert.equal(r.missileLockTarget,q.id);assert.equal(playerIsLocked(s,q.id),true);
 const warning={active:false,timer:0};assert.equal(stepHudWarning(warning,{health:q.health,locked:playerIsLocked(s,q.id)},1/60).started,true);assert.equal(warning.message,"You've been locked on");
 s.elapsed+=1/60;stepAIAttack(s,r,q,level);assert.equal(r.aiState.lockActive,true);
 assert.equal(r.aiState.shotAt,Math.fround(aiClock(s)+AI_ATTACK.missileDelay));
 s.elapsed=r.aiState.shotAt-7+.01;stepAIAttack(s,r,q,level);assert.ok(s.projectiles.some(p=>p.kind==='Missile'&&p.owner===r.id));
 stepRunnerProjectiles(s,r,1/60);assert.deepEqual(r.weapons,[null]);assert.ok(s.events.some(e=>e.type==='shot'&&e.runner===r.id&&e.missile));
});

test('bots use each collected non-missile enhancer after their laser shot',()=>{
 for(const [type,weapon]of [['enh_ntro.gam','Nitro Ram'],['enh_shok.gam','ShockWave'],['enh_disr.gam','Disruptor'],['enh_ion.gam','Ion Sword'],['enh_nano.gam','NanoShield']]){
  const {s,r,q}=attackSetup(),level=GAME_TABLES.ai.levels[0];s.collect(r,{type});stepAIAttack(s,r,q,level);assert.equal(r.weapon,weapon);
  s.elapsed=r.aiState.shotAt-7+.01;stepAIAttack(s,r,q,level);assert.deepEqual(r.weapons,[null]);assert.ok(s.events.some(e=>e.type==='secondary'&&e.runner===r.id&&e.weapon===weapon));
 }
});


test('retained, lost and reacquired locks match 1,568 consecutive original attack actions',async()=>{
 const report=JSON.parse(await readFile(new URL('../../private/verification/ai-lock-timing-native.json',import.meta.url)));assert.equal(report.passed,true);assert.equal(report.attackActions,1568);
 for(const f of report.fixtures){
  const {s,r,q}=attackSetup();s.countdown=7;r.weapons=f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]);r.weaponCells=[...f.cells];r.selectedWeapon=f.weapon===4?0:1;s.selectWeapon(r);r.aiState.lockActive=f.initialHeld;
  const shots=[];s.fire=()=>shots.push(4);s.secondary=()=>shots.push(weaponCode(r.weapon));
  for(const [i,step]of f.steps.entries()){
   shots.length=0;s.elapsed=step.clock;r.missileLockTarget=step.lock;r.aiContact={clear:step.contactClear!==false};s.sceneContacts=()=>step.probeClear===false?[{kind:'wall'}]:[];
   stepAIAttack(s,r,q,{...GAME_TABLES.ai.levels[f.level],shootEnabled:step.enabled!==false});
   assert.deepEqual({shots:[...shots],selected:r.selectedWeapon,shotAt:r.aiState.shotAt,lockActive:r.aiState.lockActive,lockTarget:r.missileLockTarget},f.native[i]);
  }
 }
});

test('target scanning and lifted ray endpoints match 1,000 original typed-hit cases',async()=>{
 const report=JSON.parse(await readFile(new URL('../../private/verification/ai-targeting-native.json',import.meta.url)));assert.equal(report.passed,true);assert.equal(report.cases,1000);
 for(const f of report.fixtures){
  const queries=[],sim={runners:f.runners,sceneContacts(a,b,r,q){queries.push({candidate:q.id,ray:[a.x,a.y,a.z,b.x,b.y,b.z]});return f.hits[q.id]}};
  assert.deepEqual({target:acquireAITarget(sim,sim.runners[f.actor],f)?.id??null,queries},f.native);
 }
});


test('an opponent stops attacking a retired target while zero health alone does not mark a model inactive',()=>{
 const {s,r,q}=attackSetup();s.runners.forEach(other=>{if(other!==r&&other!==q)other.dead=Infinity});
 Object.assign(r.aiState,{mode:'attack',target:q.id,attackUntil:Infinity,shotAt:0});q.inactive=true;
 s.ai(r,1/60);assert.equal(s.projectiles.length,0);assert.equal(r.aiState.mode,'recover');assert.equal(r.aiState.target,null);
 const next=attackSetup();Object.assign(next.r.aiState,{mode:'attack',target:next.q.id,attackUntil:Infinity,shotAt:0});next.q.health=0;next.s.ai(next.r,1/60);assert.ok(next.s.projectiles.length>0,'native target-active byte remains separate from pending health destruction');
});
