import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registeredTextureCoordinates,nativeTextureTexel} from '../../src/native-texture.js';
const audit=JSON.parse(readFileSync(new URL('../../private/verification/world-texture-native.json',import.meta.url)));
test('world texture registration matches native float stores and truncation across zero',()=>{
 assert.ok(audit.passed);assert.equal(audit.worldCases,120);
 for(const f of audit.world)assert.deepEqual(registeredTextureCoordinates(f.vertices,f).uv,f.native);
 const q=registeredTextureCoordinates([[-1,0,-1],[1,0,1],[0,0,0]]);
 assert.equal(q.origin[0],-0);assert.deepEqual(q.uv[0],[-.0625,-.0625]);
});
test('opaque texel addressing matches native wrapper, mapper and pixel writes',()=>{
 assert.equal(audit.nativeRasterDraws,800);
 for(const f of audit.samples)assert.deepEqual(nativeTextureTexel(f.uv,f.size),f.native);
 assert.deepEqual(nativeTextureTexel([.5,1],[128,128]),[63,127]);
 assert.deepEqual(nativeTextureTexel([1.1,-.1],[128,128]),[11,115]);
});
