import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {updateVertical,VERTICAL} from '../../src/vertical.js';
test('jump impulse and gravity match native data; position advances before gravity',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),f=va=>exe.readFloatLE(va-0x480000+0x68e00);
 assert.equal(VERTICAL.jumpImpulse,f(0x48416c));assert.equal(VERTICAL.gravity,f(0x48f13c));
 let r={y:0,vy:0};assert.equal(updateVertical(r,0,.04,true),true);assert.equal(r.y,VERTICAL.jumpImpulse*.04);assert.equal(r.vy,VERTICAL.jumpImpulse-VERTICAL.gravity*.04);
});
test('jump input is latched, landing respects a raised floor and the native ceiling reflects velocity',()=>{
 let r={y:10,vy:0};updateVertical(r,10,.04,true);let first=r.vy;assert.equal(updateVertical(r,10,.04,true),false);assert.ok(r.vy<first);
 for(let i=0;i<100;i++)updateVertical(r,10,.04,false);assert.equal(r.y,10);assert.equal(r.vy,0);
 r.y=63;r.vy=100;updateVertical(r,0,.04);assert.equal(r.y,64);assert.ok(r.vy<0);
});
