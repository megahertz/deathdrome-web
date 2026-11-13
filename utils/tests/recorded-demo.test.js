import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RecordedDemo} from '../../src/recorded-demo.js';
const manifest=JSON.parse(await readFile(new URL('../../private/assets/recordings/manifest.json',import.meta.url)));
test('all nine original recordings decode without dropped state packets or byte changes',async()=>{
 let count=0;
 for(let entry of manifest){
  let bytes=await readFile(new URL('../../private/assets/recordings/'+entry.file,import.meta.url)),original=await readFile(new URL('../../private/original/game/RUN/'+entry.name,import.meta.url));
  assert.deepEqual(bytes,original);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  let demo=new RecordedDemo(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(demo.duration,entry.durationSeconds);assert.equal(demo.controls.length,entry.inputRecords);
  assert.equal(demo.tracks.reduce((n,t)=>n+t.length,0),entry.runnerStateRecords);
  for(let track of demo.tracks){let previous=-Infinity;for(let p of track){assert.ok(p.time>=previous);previous=p.time;for(let k of ['x','y','z','yaw','health'])assert.ok(Number.isFinite(p[k]))}}
  count+=entry.runnerStateRecords;
 }
 assert.equal(count,22024);
});
test('recorded pose interpolation crosses the short angle and clamps at recording bounds',async()=>{
 let bytes=await readFile(new URL('../../private/assets/recordings/d0pbk.bin',import.meta.url));
 let d=new RecordedDemo(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(d.sample(-1)[0].x,493.1042785644531);assert.equal(d.sample(-1)[0].health,100);
 assert.deepEqual(d.sample(1e6),d.sample(d.duration));
 let a=d.tracks[0][0],b=d.tracks[0][1],t=(a.time+b.time)/2;
 assert.ok(Math.abs(d.sample(t)[0].x-(a.x+b.x)/2)<1e-8);
});
