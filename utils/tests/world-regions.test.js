import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorldRegions,worldRegions} from '../../src/world-regions.js';
import {Simulation} from '../../src/simulation.js';
import {inAreaCount} from '../../src/hud.js';
import {missileTarget} from '../../src/projectiles.js';

test('all eight original region grids and 8712 boundary lookups match native actions',()=>{
 const audit=JSON.parse(readFileSync(new URL('../../private/verification/world-regions-native.json',import.meta.url)));
 assert.equal(audit.passed,true);assert.equal(audit.cellCases,1568);assert.equal(audit.lookupCases,8712);
 for(const a of audit.arenas){const grid=new WorldRegions(a.arena);assert.deepEqual(grid.colors,a.colors);assert.deepEqual([...grid.masks],a.masks);for(const p of a.probes)assert.equal(grid.maskAt(p.x,p.z),p.mask,`${a.arena}: ${p.x},${p.z}`)}
});
test('IN AREA and shared lock respect original overlapping room regions',()=>{
 const grid=worldRegions(1),r={id:0,x:0,z:-300,yaw:0},a={id:1,x:300,z:-300},b={id:2,x:-300,z:-300},c={id:3,x:0,z:-100};
 const runners=[r,a,b,c];for(const q of runners)q.zoneMask=grid.maskAt(q.x,q.z);
 r.planarForwardVector={x:1,z:0};assert.equal(inAreaCount({runners},0),1);assert.equal(missileTarget(r,runners),1);
 // Same screen direction and range, across a different region boundary.
 a.x=-300;a.zoneMask=grid.maskAt(a.x,a.z);r.planarForwardVector={x:-1,z:0};assert.equal(inAreaCount({runners},0),0);assert.equal(missileTarget(r,runners),null);
});
test('IN AREA matches 256 native single-player counts across arena masks and active-model patterns',()=>{
 const audit=JSON.parse(readFileSync(new URL('../../private/verification/hud-regions-native.json',import.meta.url)));
 assert.equal(audit.passed,true);assert.equal(audit.cases,256);
 audit.fixtures.forEach((f,i)=>assert.equal(inAreaCount(f,f.player),audit.native[i]));
});
test('zone sampling precedes each active model controller and remains at the pre-motion pose',()=>{
 const sim=new Simulation();sim.countdown=0;sim.ai=()=>({});sim.runners.forEach(r=>r.inactive=r.id>1);
 const a=sim.runners[0],b=sim.runners[1];Object.assign(a,{x:127.9,y:0,z:-300,yaw:-Math.PI/2,speed:50,movementEnabled:true});Object.assign(b,{x:-300,y:0,z:-300,zoneMask:123456});
 const previous=sim.regions.maskAt(a.x,a.z),observations=[];sim.stepRunnerWeapons=r=>observations.push([r.id,a.zoneMask,b.zoneMask]);
 sim.step(1/60,{throttle:1});
 assert.deepEqual(observations,[[0,previous,123456],[1,previous,sim.regions.maskAt(-300,-300)]]);
 assert.equal(a.zoneMask,previous);assert.notEqual(sim.regions.maskAt(a.x,a.z),previous);
 sim.step(1/60,{});assert.equal(a.zoneMask,sim.regions.maskAt(a.previousPosition.x,a.previousPosition.z));
});
