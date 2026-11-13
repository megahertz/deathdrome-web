import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CreditsSequence} from '../../src/credits.js';
const data=JSON.parse(await readFile(new URL('../../private/assets/credits.json',import.meta.url)));
test('the complete credits queue preserves original strings, fonts and row spacing',async()=>{
 let exe=await readFile(new URL('../../private/original/game/RUN/ddrome.exe',import.meta.url)),offset=va=>parseInt(va,16)-0x480000+0x68e00;
 assert.equal(data.rows.length,123);assert.equal(data.rows.filter(r=>r.text).length,69);let y=240;
 for(let r of data.rows){assert.equal(r.y,y);y+=r.size+2;if(r.address){let start=offset(r.address),end=exe.indexOf(0,start);assert.equal(r.text,exe.subarray(start,end).toString('ascii').slice(0,50));assert.equal(r.size,r.font<10?10:7)}}
 assert.equal(data.rows[0].text,'CREDITS');assert.equal(data.rows[0].x,125);assert.ok(data.rows.some(r=>r.text==='PRODUCERS'));assert.ok(data.rows.some(r=>r.text==='of Viacom International Inc.'));
});
test('credits scroll one pixel per two reference frames independent of presentation chunking',()=>{
 let a=new CreditsSequence(data),b=new CreditsSequence(data);a.step(1/60);assert.equal(a.pixels,0);a.step(1/60);assert.equal(a.pixels,1);
 a.step(10-2/60);for(let i=0;i<600;i++)b.step(1/60);assert.equal(a.pixels,300);assert.equal(b.pixels,300);assert.equal(a.finished,false);
 a.step((data.rows.at(-1).y+20)/30-10);assert.equal(a.finished,true);
});
