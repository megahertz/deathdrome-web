import * as THREE from '#three';
import {boxCorners} from './scene-boxes.js';
import {chassisMatrix} from './suspension.js';
import {runnerCockpitRoll} from './runner-pose.js';
import {GAME_TABLES} from './game-tables.js';
import {transformNativePoints} from './native-geometry.js';
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix12=m=>[...m.slice(0,3),...m.slice(4,7),...m.slice(8,11),...m.slice(12,15)];
export function runnerQueryBounds(tree,{pitch=0,roll=0}={}){
 const rotation=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch,0,roll,'XYZ'));
 function bounds(node){
  const points=node.bounds?boxCorners(...node.bounds):[];
  for(const child of node.children??[]){
   let matrix=new THREE.Matrix4().fromArray(child.matrix??ID);
   if(child.animated==='cockpit')matrix.multiply(rotation);
   points.push(...transformNativePoints(boxCorners(...bounds(child)),matrix12(matrix.elements)));
  }
  return [[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))];
 }
 return bounds(tree);
}

// Whole runner World bounds determine partition eligibility/order independently
// of the chassis hit box. Native World insertion includes the complete tree.
export function runnerWorldBounds(tree,r){
 const f=Math.fround,pitch=f((r.chassisPitchDegrees??0)+(r.actionMode===2?f(r.y-(r.baseHeight??0))*GAME_TABLES.combat.emitters.jumpPitchFactor:0));
 const poses={yaw:{yaw:r.yaw},chassis:{yaw:0,chassisPitchDegrees:pitch,chassisRollDegrees:r.chassisRollDegrees??0},cockpit:{yaw:0,chassisPitchDegrees:r.actionMode===2?f(-pitch*GAME_TABLES.combat.emitters.jumpCounterPitchFactor):0,chassisRollDegrees:runnerCockpitRoll(r)}};
 function bounds(node){
  const points=node.bounds?boxCorners(...node.bounds):[];
  for(const child of node.children??[]){
   let matrix=matrix12(child.matrix??ID);
   if(child.animated)matrix=[...chassisMatrix(poses[child.animated]),...matrix.slice(9)];
   points.push(...transformNativePoints(boxCorners(...bounds(child)),matrix));
  }
  return [[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))];
 }
 const result=bounds(tree);return {min:result[0].map((v,i)=>f(v+f([r.x,r.y,r.z][i]))),max:result[1].map((v,i)=>f(v+f([r.x,r.y,r.z][i])))};
}
