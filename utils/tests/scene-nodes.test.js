import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findContactNode,contactNodeFromPath} from '../../src/scene-nodes.js';
import {View,makeModel} from '../../src/renderer.js';
import {classifyContacts} from '../../src/collision-sweep.js';

const audit=JSON.parse(readFileSync(new URL('../../private/verification/scene-nodes-native.json',import.meta.url)));
test('contact lookup matches 710 queries on links installed and removed by original Object3D actions',()=>{
 assert.equal(audit.passed,true);assert.equal(audit.cases.length,710);
 for(const [index,g] of audit.graphs.entries()){
  const nodes=g.names.map((name,id)=>({name,id,parents:[],children:[]}));
  for(const [parent,child] of g.edges){nodes[parent].children.push(nodes[child]);nodes[child].parents.push(nodes[parent])}
  for(let stage=0;stage<=g.remove.length;stage++){
   if(stage){const [parent,child]=g.remove[stage-1];nodes[parent].children=nodes[parent].children.filter(n=>n!==nodes[child]);nodes[child].parents=nodes[child].parents.filter(n=>n!==nodes[parent])}
   const original=audit.stages.find(s=>s.graph===index&&s.stage===stage);
   assert.deepEqual(nodes.map(n=>({parents:n.parents.map(p=>p.id),children:n.children.map(p=>p.id)})),original.links);
   for(const q of audit.cases.filter(q=>q.graph===index&&q.stage===stage))assert.equal(findContactNode(nodes[q.node],q.prefix)?.id??null,q.native,g.name+' '+stage+' '+q.node+' '+q.prefix);
  }
 }
});
test('production contact begins at the owning shape and chooses the closest matching ancestor',()=>{
 const path='world/runner_outer/runner_inner/chassis/p01',node=contactNodeFromPath(path);
 assert.equal(node.name,'chassis');assert.equal(findContactNode(node,'runner_').name,'runner_inner');assert.equal(findContactNode(node,'p01'),null);
 const root=makeModel({meshes:[{name:path,color:[1,0,0],v:[[0,0,0,0,0],[10,0,0,0,0],[10,10,0,0,0],[0,10,0,0,0]]}]});root.updateMatrixWorld(true);
 const view=Object.assign(Object.create(View.prototype),{arenaGroup:root}),from={x:5,y:5,z:10},to={x:5,y:5,z:-10},hits=view.sweepContacts(from,to);
 assert.equal(hits.length,1);assert.equal(hits[0].node.name,'chassis');
 const result=classifyContacts(hits,from,to);assert.equal(result.runner.node.name,'runner_inner');assert.equal(result.wall,undefined);
 // The original add-child graph has the same immediate runner ancestor.
 const original=audit.cases.find(q=>q.graph===0&&q.stage===0&&q.node===3&&q.prefix==='runner_');assert.equal(audit.graphs[0].names[original.native],result.runner.node.name);
 root.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
});
