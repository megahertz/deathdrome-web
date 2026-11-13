import test from 'node:test';
import assert from 'node:assert/strict';
import {readControls,KeyPressLatch} from '../../src/input.js';
test('WASD and arrow aliases combine as actions without double acceleration',()=>{
 assert.deepEqual(readControls(new Set(['KeyW','KeyA'])),readControls(new Set(['ArrowUp','ArrowLeft'])));
 assert.equal(readControls(new Set(['KeyW','ArrowUp'])).throttle,1);
 assert.equal(readControls(new Set(['KeyW','ArrowDown'])).throttle,0);
 assert.equal(readControls(new Set(['KeyA','ArrowRight'])).steer,0);
 const keys=new Set(['KeyW','ArrowUp']);keys.delete('KeyW');assert.equal(readControls(keys).throttle,1);keys.clear();assert.equal(readControls(keys).throttle,0);
});
test('rear view is separate from left steering and combat combinations remain available',()=>{
 const input=readControls(new Set(['KeyA','AltRight','Space','ControlLeft']));assert.equal(input.steer,1);assert.equal(input.rearView,false);assert.equal(input.fire,true);assert.equal(input.jump,true);assert.equal(input.barrier,true);
 const reverse=readControls(new Set(['KeyS','KeyD','KeyQ']));assert.equal(reverse.throttle,-1);assert.equal(reverse.steer,-1);assert.equal(reverse.rearView,true);
});
test('a new Shift alias press still selects a weapon while the other Shift remains held',()=>{
 const latch=new KeyPressLatch('ShiftLeft','ShiftRight'),keys=new Set(['ShiftLeft']);assert.equal(latch.step(keys),true);assert.equal(latch.step(keys),false);keys.add('ShiftRight');assert.equal(latch.step(keys),true);assert.equal(latch.step(keys),false);latch.reset();assert.equal(latch.step(new Set()),false);
});
