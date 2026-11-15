import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import {responsiveHudLayout,responsiveRenderSize,applyResponsiveProjection,responsiveReticle} from '../../src/responsive-layout.js';
import {hudScreenCommands} from '../../src/hud.js';
test('wide, phone and portrait HUD bounds preserve instrument height and stay inside safe areas',()=>{
 for(const [width,height,touch]of [[1280,720,false],[3440,1440,false],[844,390,true],[956,440,true],[390,844,true]]){
  const safe={top:12,right:18,bottom:16,left:24},layout=responsiveHudLayout(width,height,{touch,safe});
  for(const [panel,nativeHeight]of [[layout.top,48],[layout.bottom,63]]){
   assert.equal(panel.height,nativeHeight*panel.scale);assert.ok(panel.width+1e-9>=320*panel.scale);
   assert.ok(panel.x>=safe.left-1e-10&&panel.x+panel.width<=width-safe.right+1e-10);
   assert.ok(panel.y>=safe.top&&panel.y+panel.height<=height-safe.bottom+1e-10);
  }
  assert.ok(layout.play.height>0&&layout.play.y>=safe.top);
 }
});
test('phone landscape keeps the bottom instruments between the action pads; narrow portrait lifts them above',()=>{
 const wide=responsiveHudLayout(844,390,{touch:true});assert.ok(wide.bottom.x>=wide.touchReserve-1e-10);assert.ok(wide.bottom.x+wide.bottom.width<=844-wide.touchReserve+1e-10);
 const narrow=responsiveHudLayout(390,844,{touch:true});assert.ok(narrow.bottom.y+narrow.bottom.height<=844-narrow.touchReserve);
});
test('full-window rendering follows viewport proportions and stays within the graphics pixel budget',()=>{
 for(const [w,h,dpr]of [[1280,720,2],[844,390,3],[3440,1440,2],[390,844,3],[7680,2160,2]]){
  const size=responsiveRenderSize(w,h,dpr),low=responsiveRenderSize(w,h,dpr,.4);
  assert.ok(size.width*size.height<=1920*1200);assert.ok(size.width<=4096&&size.height<=4096);
  assert.ok(Math.abs(size.width/size.height-w/h)<.015);assert.ok(low.width<size.width&&low.height<size.height);
  assert.equal(size.width%2,0);assert.equal(size.height%2,0);
 }
});
test('responsive camera fills the full window without stretching geometry and centers the playable area',()=>{
 for(const [width,height]of [[1280,720],[2560,1080],[844,390],[390,844]]){
  const layout=responsiveHudLayout(width,height),camera=new THREE.PerspectiveCamera();applyResponsiveProjection(camera,layout);camera.updateMatrixWorld(true);
  const center=new THREE.Vector3(0,0,-20).project(camera),right=new THREE.Vector3(1,0,-20).project(camera),up=new THREE.Vector3(0,1,-20).project(camera);
  assert.ok(Math.abs((right.x-center.x)*width-(up.y-center.y)*height)<1e-8);
  assert.ok(Math.abs((1-center.y)*height/2-(layout.play.y+layout.play.height/2))<1e-8);
  assert.equal(camera.view.width,width);assert.equal(camera.view.height,height);
 }
});
test('enhanced reticles agree with the camera projection and clamp to the visible play area',()=>{
 const layout=responsiveHudLayout(1280,720),reticle=responsiveReticle({x:0,y:0},layout);assert.equal(reticle.x+reticle.width/2,640);assert.equal(reticle.y+reticle.height/2,360);
 const edge=responsiveReticle({x:10,y:-10},layout);assert.ok(edge.x+edge.width<1280);assert.ok(edge.y+edge.height<=layout.play.y+layout.play.height);
});
test('original screen cues retain native positions and timings while the frame can be rendered separately',()=>{
 const sim={runners:[{disrupted:0}],round:1,requiredKills:2,countdown:2,entrance:{active:true,elapsed:1}};
 const cues=hudScreenCommands(sim,0,{messages:[{text:'TEST',until:10}],now:1});
 assert.equal(cues[0].x,150);assert.ok(cues.some(c=>c.value==='ROUND 1'&&c.y===60));assert.ok(cues.some(c=>c.value==='2 KILLS REQUIRED TO ESCAPE'&&c.y===84));assert.ok(cues.some(c=>c.value==='2'&&c.y===90&&c.scale===1));
});
