import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {healthAfterDelta} from '../../src/health.js';
test('profile health math/protection matches 480 original executable cases',()=>{
 const a=JSON.parse(fs.readFileSync(new URL('../../private/verification/health-native-audit.json',import.meta.url)));
 a.fixtures.forEach((f,i)=>assert.equal(healthAfterDelta(f.health,f.delta,f),a.native[i]));
});
