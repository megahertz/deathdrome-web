import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../public/vendor/three.module.js';
import {makeRunnerPreview,stepRunnerPreview} from '../../src/runner-preview.js';
import {MENU_PROJECTION,previewFloorPolygons} from '../../src/preview-raster.js';
const audit=JSON.parse(readFileSync(new URL('../../private/verification/menu-floor-raster-native.json',import.meta.url)));
test('all eight production menu floors retain the native clipping/projection at six headings',()=>{
 assert.equal(audit.passed,true);assert.equal(audit.cases,48);assert.equal(audit.comparedIndexBytes,3072000);
 for(const fixture of audit.fixtures){
  assert.deepEqual(MENU_PROJECTION,fixture.options);
  const data=JSON.parse(readFileSync(new URL('../../private/assets/models/'+fixture.name+'.json',import.meta.url)));
  data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:undefined}));
  const root=makeRunnerPreview(data);stepRunnerPreview(root,fixture.angle*Math.PI/90);
  const camera=new THREE.PerspectiveCamera(18,1,1.5,1024);camera.position.set(0,2.3,10);camera.rotation.set(-10*Math.PI/180,0,0);
  assert.deepEqual(JSON.parse(JSON.stringify(previewFloorPolygons(root,camera).map(({vertices,projected})=>({vertices,projected})))),fixture.polygons);
 }
});

test('graphics detail retains the authored camera clip distances; menu uses its own near plane',async()=>{
 const {View}=await import('../../src/renderer.js');
 assert.equal(audit.nativeLODSetterChecks.length,8);
 for(const check of audit.nativeLODSetterChecks)assert.deepEqual(check.nearFar,[.75,1200]);
 for(const preview of [false,true])for(let detail=0;detail<=9;detail++){
  const view={detail,preview,hud:!preview,scene:{traverse(){}},objects:{children:[]},camera:{updateProjectionMatrix(){}},renderer:{setViewport(){},setClearColor(){},clear(){},render(){}}};
  View.prototype.draw.call(view);
  assert.equal(view.camera.near,preview?1.5:.75);assert.equal(view.camera.far,preview?1024:1200);
 }
});
