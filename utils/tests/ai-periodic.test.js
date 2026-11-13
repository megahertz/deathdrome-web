import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation.js';
import {GAME_TABLES} from '../../src/game-tables.js';
import {resetAI,stepAIActions} from '../../src/ai-actions.js';
import {WEAPON_NAMES,inventoryCells} from '../../src/inventory.js';
const audit=JSON.parse(readFileSync(new URL('../../private/verification/ai-periodic-native.json',import.meta.url)));

test('512 original periodic controller sequences match all 8704 timer, barrier, RNG and inventory states',()=>{
 assert.equal(audit.passed,true);assert.equal(audit.sequences,512);assert.equal(audit.controllerActions,8704);
 for(const [i,f] of audit.fixtures.entries()){
  const sim=new Simulation(),r=sim.runners[1];let draws=0;sim.countdown=0;sim.randomInt=()=>f.stream[draws++%f.stream.length];
  Object.assign(r,{weapons:f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]),weaponCells:[...f.cells]});
  Object.assign(r.aiState,{mode:{0:'path',1:'attack',3:'recover'}[f.mode],jumpAt:8,barrierAt:8,enhancerAt:8,barrierHeld:f.held});
  for(const [j,clock] of f.clocks.entries()){
   sim.elapsed=clock-7;const recovering=r.aiState.mode==='recover';if(recovering&&f.modeAfter===0)r.aiState.mode='path';
   const a=stepAIActions(sim,r,GAME_TABLES.ai.levels[f.level],{recovering});
   assert.deepEqual({mode:{path:0,attack:1,recover:3}[r.aiState.mode],jump:a.jump,barrier:a.barrier,jumpAt:r.aiState.jumpAt,barrierAt:r.aiState.barrierAt,enhancerAt:r.aiState.enhancerAt,draws,cells:[...inventoryCells(r)],count:r.weapons.length},audit.native[i][j],`${i}: ${j}`);
  }
 }
});
test('32 original initial timer stores and two RNG draws match, including fractional and large clocks',()=>{
 assert.equal(audit.initializationCases,32);
 for(const [i,f] of audit.initializations.entries()){
  const sim=new Simulation(),r=sim.runners[1];let draws=0;sim.countdown=0;sim.elapsed=f.clock-7;sim.randomInt=()=>f.stream[draws++];resetAI(sim,r);const a=r.aiState;
  assert.deepEqual({attackAfter:a.attackAfter,jumpAt:a.jumpAt,barrierAt:a.barrierAt,enhancerAt:a.enhancerAt,lockActive:a.lockActive,draws},audit.initialized[i],`${i}`);
 }
});
test('production AI defers barrier starts according to the dispatched branch before recovery transitions',()=>{
 const paths=[{id:0,color:12,position:[0,0,-100],links:[1,3,-1]},{id:1,color:12,position:[100,0,-100],links:[2,0,-1]},{id:2,color:12,position:[100,0,0],links:[3,1,-1]},{id:3,color:12,position:[0,0,0],links:[0,2,-1]}];
 const sim=new Simulation({paths}),r=sim.runners[1];sim.countdown=0;r.yaw=0;r.navigation.alignment={x:0,z:-1};
 Object.assign(r.aiState,{mode:'recover',recoverUntil:Infinity,barrierAt:7,barrierHeld:false,jumpAt:Infinity,enhancerAt:Infinity});
 const aligned=sim.ai(r,1/60);assert.equal(r.aiState.mode,'path');assert.equal(aligned.barrier,false);assert.equal(r.aiState.barrierAt,11);
 Object.assign(r.aiState,{mode:'attack',target:0,attackUntil:7,barrierAt:7,barrierHeld:false});r.aiContact={clear:false};
 const expired=sim.ai(r,1/60);assert.equal(r.aiState.mode,'recover');assert.equal(expired.barrier,true);assert.equal(r.aiState.barrierAt,7);
});
