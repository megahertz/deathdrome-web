import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boxCorners,prepareBox,intersectBox} from '../../src/scene-boxes.js';
import {View,makeModel,THREE,transformModelGeometry} from '../../src/renderer.js';

const audit=JSON.parse(readFileSync(new URL('../../private/verification/scene-boxes-native.json',import.meta.url)));
test('box corners and 1815 face, endpoint, inside and grazing queries match native actions exactly',()=>{
 assert.equal(audit.passed,true);assert.equal(audit.cases,1815);assert.equal(audit.maximumNumericError,0);
 for(const c of audit.cornerCases){const points=boxCorners(c.min,c.max).map(p=>[0,1,2].map(i=>Math.fround(c.matrix[i]*p[0]+c.matrix[i+3]*p[1]+c.matrix[i+6]*p[2]+c.matrix[i+9])));points.forEach((p,i)=>p.forEach((v,j)=>assert.ok(v===c.native[i][j])))}
 const boxes=audit.boxes.map(b=>prepareBox(b.vertices));audit.fixtures.forEach((f,i)=>{
  const h=intersectBox(boxes[f.box],f.from,f.to),expected=audit.native[i];assert.equal(!!h,!!expected,`hit ${i}`);
  if(h)for(const k of ['normal','point'])Object.values(h[k]).forEach((v,j)=>assert.ok(v===expected[k][j],`${i} ${k}.${j}`));
 });
});
test('all 18 source arena boxes replace their display faces in production queries',()=>{
 const models=new Map(),views=new Map();
 for(const [index,box] of audit.boxes.entries()){
  if(!box.arena)continue;if(!models.has(box.arena)){const data=JSON.parse(readFileSync(new URL(`../../private/assets/models/arena${box.arena}.json`,import.meta.url)));data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:null}));models.set(box.arena,data)}
  const prefix=box.name.slice(0,-'__bbox'.length),root=makeModel(models.get(box.arena),f=>f.name.startsWith(prefix));root.updateMatrixWorld(true);views.set(index,Object.assign(Object.create(View.prototype),{arenaGroup:root}));
 }
 assert.equal(views.size,18);
 audit.fixtures.forEach((f,i)=>{const view=views.get(f.box);if(!view)return;const hits=view.sweepContacts(f.from,f.to),expected=audit.native[i];assert.equal(hits.length,expected?1:0,`contacts ${i}`);if(expected){assert.equal(hits[0].name,audit.boxes[f.box].name);for(const [j,k] of ['x','y','z'].entries())assert.ok(hits[0].point[k]===expected.point[j])}});
 for(const view of views.values())view.arenaGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
});
test('moving and locally transformed box proxies update their queries and respect visibility',()=>{
 const data={meshes:[],collisionBoxes:[{name:'door_x/lift_x/__bbox',vertices:boxCorners([0,0,0],[10,10,10])}]},root=makeModel(data),view=Object.assign(Object.create(View.prototype),{arenaGroup:root}),a={x:5,y:5,z:20},b={x:5,y:5,z:-10};root.updateMatrixWorld(true);
 assert.equal(view.sweepContacts(a,b)[0].point.z,10);root.position.z=40;root.updateMatrixWorld(true);assert.equal(view.sweepContacts(a,b).length,0);
 root.position.z=0;transformModelGeometry(root,new THREE.Matrix4().makeTranslation(0,0,5));root.updateMatrixWorld(true);assert.equal(view.sweepContacts(a,b)[0].point.z,15);
 root.visible=false;assert.equal(view.sweepContacts(a,b).length,0);root.visible=true;root.children[0].userData.intersect=false;assert.equal(view.sweepContacts(a,b).length,0);
});
