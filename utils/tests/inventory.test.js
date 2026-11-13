import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inventoryCells,selectInventoryWeapon,appendWeapon,consumeWeapon,resetInventory,cycleInventory,WEAPON_NAMES,weaponCode} from '../../src/inventory.js';
import {rollAIEnhancer,chooseAIEnhancer} from '../../src/ai-actions.js';
import {Simulation} from '../../src/simulation.js';
const report=name=>JSON.parse(fs.readFileSync(new URL(`../../private/verification/${name}-native-audit.json`,import.meta.url)));
test('four-cell inventory writes, active count, selection, pointer and bonuses match original action fixtures',()=>{
 const a=report('inventory');a.fixtures.forEach(({state,actions},i)=>{let r={weaponCells:[...state.cells],weapons:state.cells.slice(0,state.count).map(id=>WEAPON_NAMES[id]),selectedWeapon:state.selected,missileLockTarget:1};selectInventoryWeapon(r);let samples=actions.map(action=>{let score=0;if(action.kind==='append'){let result=appendWeapon(r,WEAPON_NAMES[action.weapon]);if(result.matching&&state.human)score=2000}else if(action.kind==='consume')consumeWeapon(r);else if(action.kind==='cycle')cycleInventory(r);else{if(action.kind==='coldReset')r={weapons:[null]};resetInventory(r)}return {cells:[...inventoryCells(r)],count:r.weapons.length,selected:r.selectedWeapon,weapon:weaponCode(r.weapon),target:r.missileLockTarget??null,score}});assert.deepEqual(samples,a.native[i])});
});
test('AI rolls, duplicate choices and RNG draw counts match 217 original x86 fixtures',()=>{
 const a=report('ai-enhancers');a.fixtures.forEach(({cells,count,draws},i)=>{let index=0,sim={randomInt:()=>draws[index++]},raw=rollAIEnhancer(sim),rawDraws=index;index=0;let r={weapons:cells.slice(0,count).map(id=>WEAPON_NAMES[id]),weaponCells:[...cells]},chosen=weaponCode(chooseAIEnhancer(sim,r));assert.deepEqual({raw,rawDraws,chosen,draws:index},a.native[i])});
});
test('a consumed NanoShield stays in an inactive cell and changes later AI choices',()=>{
 let r={weapons:[null,'NanoShield'],selectedWeapon:1};selectInventoryWeapon(r);consumeWeapon(r);assert.deepEqual(r.weapons,[null]);assert.deepEqual(inventoryCells(r),[4,6,0,0]);assert.equal(chooseAIEnhancer({randomInt:()=>6},r),'Missile');assert.equal(chooseAIEnhancer({randomInt:()=>6},{weapons:[null]}),'NanoShield');
});
test('the AI walk can wrap to Nitro when four occupied cells leave its native ID absent',()=>{
 let r={weapons:[null,'Disruptor','Ion Sword','NanoShield'],weaponCells:[4,3,5,6]};assert.equal(chooseAIEnhancer({randomInt:()=>6},r),'Nitro Ram');
});
test('spawn resets active inventory to Laser while retaining unused native cells',()=>{
 let s=new Simulation(),r=s.runners[0];assert.deepEqual(inventoryCells(r),[4,0,0,0]);appendWeapon(r,'Missile');appendWeapon(r,'ShockWave');appendWeapon(r,'NanoShield');r.selectedWeapon=2;selectInventoryWeapon(r);consumeWeapon(r);assert.deepEqual(inventoryCells(r),[4,1,6,6]);s.spawn(r);assert.deepEqual(r.weapons,[null]);assert.equal(r.weapon,null);assert.equal(r.selectedWeapon,0);assert.deepEqual(inventoryCells(r),[4,1,6,6]);
});
test('full delayed player respawn discards active pickups and preserves their retained cells',()=>{
 let s=new Simulation({ground:()=>0,blocked:()=>false});s.countdown=0;s.ai=()=>({});s.runners.forEach(r=>r.dead=Infinity);let r=s.runners[s.player];Object.assign(r,{dead:0,x:100,y:0,z:100});s.collect(r,{type:'enh_lock.gam'});s.collect(r,{type:'enh_nano.gam'});let cells=[...inventoryCells(r)];s.damage(r,10000,1);for(let i=0;i<210;i++)s.step(1/60);assert.equal(s.lives,2);assert.equal(r.health,100);assert.equal(r.respawn,null);assert.deepEqual(r.weapons,[null]);assert.deepEqual(inventoryCells(r),cells);
});
