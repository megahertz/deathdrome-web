import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAME_TABLES} from '../../src/game-tables.js';
import {Simulation,DYNAMICS} from '../../src/simulation.js';
import {updateDrive} from '../../src/drive.js';
test('all five aggression parameter rows match native configuration files',async()=>{
 let text=await readFile(new URL('../../private/original/game/RUN/ag_lev.txt',import.meta.url),'utf8'),rows=text.split(/\r?\n/).filter(s=>/^\s*\d/.test(s)).map(s=>s.trim().split(/\s+/).map(Number)),fields=['radiusSquared','attackSeconds','shotSeconds','enhancerSeconds','speedFactor'];
 assert.equal(rows.length,5);for(let i=0;i<8;i++)for(let j=0;j<5;j++)assert.equal(GAME_TABLES.ai.levels[i][fields[j]],Math.fround(rows[j][i]));
});
test('native aggression scales AI speed caps while preserving the selected human runner cap',()=>{
 let easy=new Simulation(),hard=new Simulation({arena:8,round:3,player:7});
 assert.equal(easy.runners[1].aiMaxSpeed,60);assert.equal(hard.runners[0].aiMaxSpeed,93.75);assert.equal(hard.runners[7].aiMaxSpeed,undefined);
 let a=easy.runners[1],p=hard.runners[7];a.speed=500;p.speed=500;updateDrive(a,{throttle:1},1/60,DYNAMICS);updateDrive(p,{throttle:1},1/60,DYNAMICS);assert.equal(a.speed,60);assert.equal(p.speed,80);
});
