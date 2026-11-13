import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {texturePolygonCommands,texturePolygonRows,drawIndexedTexturePolygon} from '../../src/texture-spans.js';
const audit=JSON.parse(readFileSync(new URL('../../private/verification/texture-spans-native.json',import.meta.url)));
test('native convex edge collection and perspective span commands match 120 original draws',()=>{
 assert.equal(audit.passed,true);assert.equal(audit.cases,120);
 for(const fixture of audit.fixtures){assert.deepEqual(texturePolygonRows(fixture.vertices),fixture.rows);assert.deepEqual(texturePolygonCommands(fixture.vertices,fixture.size,fixture),fixture.native)}
});
test('opaque span writes match all 15,360,000 native indexed pixel bytes',()=>{
 for(const fixture of audit.fixtures)for(const axis of [0,1]){
  const target=new Uint8Array(64000).fill(255),[width,height]=fixture.size,pixels=Uint8Array.from({length:width*height},(_,i)=>axis?Math.floor(i/width)%256:i%width%256);
  drawIndexedTexturePolygon(target,320,fixture.vertices,{width,height,pixels},fixture);
  assert.equal(createHash('sha256').update(target).digest('hex'),fixture.nativeFrameHashes[axis]);
 }
});
