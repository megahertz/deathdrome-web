import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceDropTarget} from '../../src/resource-drop.js';
function target(){const panel=new EventTarget();panel.dataset={};let ready=true;const loaded=[];const reset=resourceDropTarget(panel,{canLoad:()=>ready,onFile:file=>{loaded.push(file);ready=false}});return {panel,loaded,reset,setReady:value=>ready=value}}
function drag(panel,type,{types=['Files'],files=[]}={}){const event=new Event(type,{cancelable:true});event.dataTransfer={types,files,dropEffect:'none'};panel.dispatchEvent(event);return event}
test('file drag highlights the loader, offers copy, and nested children do not flicker the highlight',()=>{
 const {panel}=target();assert.equal(drag(panel,'dragenter').defaultPrevented,true);assert.equal(panel.dataset.dragging,'true');
 drag(panel,'dragenter');drag(panel,'dragleave');assert.equal(panel.dataset.dragging,'true');
 const over=drag(panel,'dragover');assert.equal(over.dataTransfer.dropEffect,'copy');assert.equal(over.defaultPrevented,true);
 drag(panel,'dragleave');assert.equal(panel.dataset.dragging,undefined);
});
test('drop clears the highlight, loads one file and blocks subsequent drops during loading',()=>{
 const {panel,loaded}=target(),file={name:'game.iso'};drag(panel,'dragenter');
 assert.equal(drag(panel,'drop',{files:[file,{name:'other.zip'}]}).defaultPrevented,true);assert.deepEqual(loaded,[file]);assert.equal(panel.dataset.dragging,undefined);
 drag(panel,'dragenter');assert.equal(panel.dataset.dragging,undefined);
 assert.equal(drag(panel,'dragover').dataTransfer.dropEffect,'none');
 assert.equal(drag(panel,'drop',{files:[file]}).defaultPrevented,true);assert.equal(loaded.length,1);
});
test('text and URL drags do not advertise a file import or intercept normal behavior',()=>{
 const {panel,loaded}=target();for(const type of ['dragenter','dragover','drop'])assert.equal(drag(panel,type,{types:['text/uri-list']}).defaultPrevented,false);
 assert.equal(panel.dataset.dragging,undefined);assert.deepEqual(loaded,[]);
});
test('cancellation, an empty drop, and starting another import all clear acceptance feedback',()=>{
 const {panel,reset,setReady}=target();drag(panel,'dragenter');drag(panel,'dragend');assert.equal(panel.dataset.dragging,undefined);
 drag(panel,'dragenter');drag(panel,'drop');assert.equal(panel.dataset.dragging,undefined);
 drag(panel,'dragenter');reset();drag(panel,'dragleave');assert.equal(panel.dataset.dragging,undefined);
 drag(panel,'dragenter');setReady(false);drag(panel,'dragover');assert.equal(panel.dataset.dragging,undefined);
});
