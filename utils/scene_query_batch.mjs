// Query the production arena loader without a WebGL context. Only texture
// requests are removed; meshes, external references and query code are real.
import {readFile} from 'node:fs/promises';
import {View,THREE} from '../src/renderer.js';
import {altitudeFacetHits,segmentFacetHits} from '../src/scene-geometry.js';
import {pathToFileURL} from 'node:url';
export async function queryScene(q){
const previousFetch=globalThis.fetch;
globalThis.fetch=async path=>({ok:true,json:async()=>{
 const name=String(path).split('?')[0],data=JSON.parse(await readFile(new URL('../private/'+name,import.meta.url)));
 return {...data,worldObjects:q.ignoreWorldPartitions?undefined:data.worldObjects,meshes:data.meshes.map(f=>({...f,texture:null,cycle:null}))};
}});
try{
const view=Object.assign(Object.create(View.prototype),{
 scene:new THREE.Scene(),stage:new THREE.Group(),objects:new THREE.Group(),camera:new THREE.PerspectiveCamera()});
view.scene.background=new THREE.Color(0x090b10);
await view.arena(q.arena);view.configurePortals(q.round??1);
const results=q.fixtures.map(f=>{
 const hits=f.kind==='ground'?altitudeFacetHits(view.arenaGroup,f.x,f.z):segmentFacetHits(view.arenaGroup,f.from,f.to);
 return hits.map(h=>({name:h.name.split('/').at(-2)??h.name,path:h.name,normal:h.normal,
  ...f.kind==='ground'?{height:h.height}:{point:h.point}}));
});
view.clear();return results;
}finally{globalThis.fetch=previousFetch}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 process.stdout.write(JSON.stringify(await queryScene(JSON.parse(input))));
}
