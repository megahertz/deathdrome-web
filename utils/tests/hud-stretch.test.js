import test from 'node:test';
import assert from 'node:assert/strict';
import {responsiveHudLayout} from '../../src/responsive-layout.js';
import {HUD_STRETCH_BANDS,hudBandSlices,hudWidgetSlices,hudAnchorX} from '../../src/hud-stretch.js';
test('HUD chrome spans the full desktop width and expands only its empty source columns',()=>{
 for(const [w,h]of [[1280,720],[1720,720],[2560,1080]]){
  const layout=responsiveHudLayout(w,h);assert.equal(layout.top.x,0);assert.equal(layout.top.width,w);assert.equal(layout.bottom.width,w);
  for(const band of HUD_STRETCH_BANDS){
   const panel=layout[band.panel],parts=hudBandSlices(panel,band);
   assert.equal(parts[0].dx,panel.x);assert.ok(Math.abs(parts[2].dx+parts[2].dw-panel.x-panel.width)<1e-9);
   for(const part of [parts[0],parts[2]])assert.ok(Math.abs(part.dw/part.sw-part.dh/part.sh)<1e-12);
   assert.equal(parts[1].sw,2);assert.ok(parts[1].dw>=panel.scale);
   assert.equal(parts[0].dx+parts[0].dw,parts[1].dx);assert.ok(Math.abs(parts[1].dx+parts[1].dw-parts[2].dx)<1e-9);
  }
 }
});
test('numbers, weapons, radar and life credits translate without horizontal scaling',()=>{
 const layout=responsiveHudLayout(1720,720);
 for(const [panel,band]of [[layout.top,{y:0,height:48,split:224}],[layout.bottom,{y:137,height:63,split:185,origin:137}]]){
  for(const part of hudWidgetSlices(panel,band))assert.ok(Math.abs(part.dw/part.sw-part.dh/part.sh)<1e-12);
 }
 const extra=layout.bottom.width-320*layout.bottom.scale;
 assert.equal(hudAnchorX(layout.bottom,148),148*layout.bottom.scale); // Health stays beside the weapons.
 assert.equal(hudAnchorX(layout.bottom,251,'right'),251*layout.bottom.scale+extra); // Radar stays at the right edge.
 assert.equal(hudAnchorX(layout.bottom,144,'center'),144*layout.bottom.scale+extra/2); // Warning sits in the extended trough.
});
