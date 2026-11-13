import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation} from '../../src/simulation.js';
import {ESCAPE,canOpponentExit,beginOpponentExit,stepOpponentExit} from '../../src/escape.js';
import {runnerBodyVisible} from '../../src/respawn.js';
const graph=[{id:0,color:12,position:[0,0,-100],links:[1,3,-1]},{id:1,color:12,position:[100,0,-100],links:[2,0,-1]},{id:2,color:12,position:[100,0,0],links:[3,1,-1]},{id:3,color:12,position:[0,0,0],links:[0,2,-1]}];
function setup(){let s=new Simulation({paths:graph,ground:()=>0}),r=s.runners[1];s.countdown=0;s.time=34;s.ai=()=>({});Object.assign(s.runners[0],{x:100,y:0,z:100,yaw:0,speed:0});Object.assign(r,{x:0,y:0,z:0,speed:0,vy:0,kills:s.requiredKills});return {s,r}}

test('opponent exit time gate and separate rise speed match the original executable',async()=>{
 let b=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),at=v=>v-0x480000+0x68e00;assert.equal(ESCAPE.aiExitSeconds,b.readFloatLE(at(0x483f66)));assert.equal(ESCAPE.aiRiseSpeed,b.readFloatLE(at(0x484de7)));assert.equal(ESCAPE.aiRiseSpeed,25);
});
test('only qualified live opponents at the central ground exit can leave at or below thirty-five seconds',()=>{
 let {s,r}=setup();s.time=35.001;assert.equal(canOpponentExit(s,r),false);s.time=35;assert.equal(canOpponentExit(s,r),true);
 for(let change of [{kills:1},{x:18.001},{y:.10001},{dead:1},{escaped:true}]){let before={...r};Object.assign(r,change);assert.equal(canOpponentExit(s,r),false);Object.assign(r,before)}
 Object.assign(r,{x:18,y:.1});assert.equal(canOpponentExit(s,r),true);s.player=r.id;assert.equal(canOpponentExit(s,r),false);
});
test('opponent exit starts replacement materialization immediately and preserves route counts and player rewards',()=>{
 let {s,r}=setup(),counts=[...s.aiRouteCounts];assert.equal(beginOpponentExit(s,r),true);assert.ok(r.opponentExit);assert.equal(r.escaped,true);assert.equal(r.dead,Infinity);assert.equal(runnerBodyVisible(r),true);assert.equal(r.navigation,null);assert.equal(s.phase,'running');assert.ok(s.runners[5].respawn);assert.equal(s.runners[5].respawn.allocateRoute,false);assert.equal(s.runners[5].respawn.goalColor,0);assert.deepEqual(s.aiRouteCounts,counts);assert.equal(s.score,0);assert.equal(s.lives,3);assert.equal(s.wrecks.states[1],null);
 assert.equal(beginOpponentExit(s,r),false,'an exited model cannot trigger another replacement');
});
test('concurrent opponent exit advances its phases while the player keeps driving and the replacement finishes',()=>{
 let {s,r}=setup();beginOpponentExit(s,r);let player=s.runners[0],z=player.z,counts=[...s.aiRouteCounts],phases=new Set();
 for(let i=0;i<360;i++){if(r.opponentExit)phases.add(r.opponentExit.phase);s.step(1/60,{throttle:1})}
 assert.deepEqual([...phases],['delay','center','fold','rise']);assert.ok(player.z<z-100);assert.equal(s.phase,'running');assert.equal(s.escape,undefined);assert.equal(r.opponentExit,null);assert.equal(runnerBodyVisible(r),false);assert.ok(Math.abs(r.y-50)<.5);assert.equal(s.runners[5].respawn,null);assert.equal(s.runners[5].health,100);assert.equal(s.runners[5].navigation.goalColor,0,'exit replacement retains its unassigned goal rather than consuming another route');assert.deepEqual(s.aiRouteCounts,counts);assert.equal(s.roundBonus,undefined);
});
test('escaped models remain excluded from the inactive pool after the visible exit ends',()=>{
 let {s,r}=setup();beginOpponentExit(s,r);for(let i=0;i<360;i++)stepOpponentExit(s,r,1/60);s.population.cursor=1;assert.notEqual(s.population.nextInactive()?.id,1);s.runners[6].escaped=s.runners[7].escaped=true;assert.equal(s.population.nextInactive(),null);
});
test('opponent exit still completes if no replacement model is available',()=>{
 let {s,r}=setup();s.population.nextInactive=()=>null;assert.equal(beginOpponentExit(s,r),true);assert.equal(s.events.at(-1).replacement,null);for(let i=0;i<360;i++)stepOpponentExit(s,r,1/60);assert.equal(r.opponentExit,null);assert.equal(s.phase,'running');
});
test('death replacement releases the current goal color after late retreat, not the former colored route',()=>{
 let {s,r}=setup();r.navigation.goalColor=12;let counts=[...s.aiRouteCounts],next=s.population.replace(r);assert.equal(next.id,5);assert.equal(next.respawn.routeIndex,0);assert.deepEqual(s.aiRouteCounts,counts);
});
test('a full route budget leaves a destroyed opponent inactive without scanning or inventing a replacement',()=>{
 let {s,r}=setup();s.aiRouteCounts=[0,3,3,1,1];let called=false;s.population.nextInactive=()=>{called=true;return s.runners[5]};assert.equal(s.population.replace(r),null);assert.equal(called,false);assert.equal(r.inactive,true);assert.equal(s.runners[5].respawn,null);
});
