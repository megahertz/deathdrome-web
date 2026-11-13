import './tests/setup.js';
// Line-based geometry adapter for the isolated original-code comparison.
// Both engines query the same decoded mesh. This does not replace the native
// scene collector, whose eligibility/order remain a separate verification gap.
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {View,THREE,makeArenaGeometry} from '../src/renderer.js';
import {Simulation} from '../src/simulation.js';
let view,nativeView,sim,r,dt;
function sceneView(data,round){const v=Object.assign(Object.create(View.prototype),makeArenaGeometry(data),{ray:new THREE.Raycaster(),collisionMaterials:new Map()});v.arenaGroup.traverse(o=>{if(o.material)v.collisionMaterials.set(o.material,o.material.side)});v.arenaGroup.updateMatrixWorld(true);v.configurePortals(round);return v}
function snapshot(){return {position:[r.x,r.y,r.z],yaw:r.yaw*180/Math.PI,pitch:r.chassisPitchDegrees,roll:r.chassisRollDegrees,turn:r.turn*180/Math.PI,turnAcceleration:r.turnAcceleration*180/Math.PI,acceleration:r.acceleration,localVelocity:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],worldVelocity:Object.values(r.worldVelocity??{x:0,y:0,z:0}),forward:Object.values(r.forwardVector??{x:0,y:0,z:-1}),frontVelocity:r.frontVelocity,sideVelocity:r.sideVelocity,grounded:r.grounded,controlsEnabled:r.controlsEnabled,disableTimer:r.disableTimer,movementEnabled:r.movementEnabled,supportContact:r.supportContact,brake:r.supportBrake,slopeImpulse:r.slopeImpulse,nitro:r.nitro}}
async function request(q){
 if(q.action==='load'){
  for(const v of [view,nativeView])v?.arenaGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
  const data=JSON.parse(await readFile(new URL(`../private/assets/models/arena${q.arena}.json`,import.meta.url)));data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:null}));
  if(q.subtree){data.meshes=data.meshes.filter(f=>f.name.includes('/'+q.subtree+'/'));data.collisionBoxes=(data.collisionBoxes??[]).filter(f=>f.name.includes('/'+q.subtree+'/'))}
  view=sceneView(data,q.round);nativeView=sceneView(data,q.round);
  dt=q.dt;const pose=view.portalApproach(q.portal);if(q.side===-1){const group=view.portals[q.portal].open?.visible?view.portals[q.portal].open:view.portals[q.portal].lock,center=new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());pose.x=2*center.x-pose.x;pose.z=2*center.z-pose.z;pose.y=view.ground(pose.x,pose.z,center.y+20);pose.yaw+=Math.PI}for(const k of ['x','y','z'])pose[k]=Math.fround(pose[k]);pose.yaw=Math.fround(pose.yaw*180/Math.PI)*Math.PI/180;
  sim=new Simulation({arena:q.arena,round:q.round,ground:(...args)=>view.ground(...args),sceneSweep:(a,b)=>view.sweepContacts(a,b),updatePortal:(id,h)=>view.setPortalHeight(id,h)});sim.countdown=0;sim.runners.forEach(r=>r.dead=Infinity);r=sim.runners[0];Object.assign(r,pose,{dead:0,inactive:false,movementEnabled:true,shield:100,collisionProbe:{x:pose.x,y:pose.y,z:pose.z},rearProbe:{x:pose.x,y:pose.y,z:pose.z},previousPosition:{x:pose.x,y:pose.y,z:pose.z}});
  return {r:{...r,aiState:undefined,navigation:undefined},state:snapshot(),portalIds:Object.keys(view.portals).sort()};
 }
 const v=q.engine==='native'?nativeView:view;
 if(q.action==='ground')return v.ground(q.x,q.z,200,true);
 if(q.action==='sweep')return v.sweepContacts(q.from,q.to);
 if(q.action==='setPortal'){v.setPortalHeight(q.portal,q.height);return true}
 if(q.action==='step'){sim.step(dt,{throttle:1});return {state:snapshot(),portals:Object.fromEntries([...sim.portals.doors].map(([id,p])=>[id,p.height])),contacts:Object.fromEntries(Object.entries(r.collisionContacts??{}).map(([k,h])=>[k,{name:h.name,point:h.point,normal:h.normal}]))}}
 throw Error('Unknown scene request');
}
for await(const line of createInterface({input:process.stdin})){
 try{process.stdout.write(JSON.stringify({value:await request(JSON.parse(line))})+'\n')}catch(error){process.stdout.write(JSON.stringify({error:error.stack})+'\n')}
}
