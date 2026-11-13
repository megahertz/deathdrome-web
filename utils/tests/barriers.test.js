import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BarrierTrails,BARRIER} from '../../src/barriers.js';
test('barrier requires forward ground motion and forms at most twenty connected faces',()=>{
 let b=new BarrierTrails(),r={id:0,x:0,y:1,z:0,speed:75};assert.equal(b.input(r,true),false);assert.equal(b.active.length,0);
 r.y=0;r.speed=-5;assert.equal(b.input(r,true),false);r.speed=75;assert.equal(b.input(r,true),false);assert.equal(b.input(r,true),true);
 for(let i=0;i<30;i++){r.z-=3;b.input(r,true);b.step(1/60)}
 let t=b.active[0];assert.equal(t.points.length,21);assert.equal(t.generating,false);assert.equal(t.points[0].z,0);assert.equal(t.points.at(-1).z,-60);
});
test('barrier release ends generation; expiry retracts faces before allowing a new trail',()=>{
 let b=new BarrierTrails(),r={id:0,x:0,y:0,z:0,speed:75};b.input(r,true);
 for(let i=0;i<10;i++){r.z-=3;b.input(r,true)}let t=b.active[0],length=t.points.length;
 b.input(r,false);r.x=10;b.input(r,true);assert.equal(t.points.length,length);assert.equal(t.points.at(-1).x,0);
 b.step(BARRIER.seconds);assert.equal(t.retract,1);assert.equal(t.generating,false);
 for(let i=0;i<30;i++)b.step(1/60);assert.equal(b.active.length,0);assert.equal(b.input(r,true),false);
 b.input(r,false);assert.equal(b.input(r,true),true);
});
test('barrier contacts follow the trail rather than a circle around its owner',()=>{
 let b=new BarrierTrails(),r={id:0,x:0,y:0,z:0,speed:75};b.input(r,true);r.z=-3;b.input(r,true);r.z=-6;b.input(r,true);
 let t=b.active[0];assert.equal(b.contacts(t,{id:1,x:1,y:0,z:-2}),true);assert.equal(b.contacts(t,{id:1,x:5,y:0,z:-2}),false);
 assert.equal(b.contacts(t,{id:1,x:0,y:5,z:-2}),false);assert.equal(b.contacts(t,{id:0,x:0,y:0,z:-2}),false);
});
