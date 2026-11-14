import * as THREE from '#three';
import {AdaptiveResolution,VisualParticles,FOG_PROFILES,contactShadowPose} from './enhanced-visuals.js';
import {EnhancedPipeline} from './enhanced-pipeline.js';
import {emitterOrigins} from './weapon-emitters.js';
import {runnerBodyVisible} from './respawn.js';
const COLORS=[[1,.16,.06],[.12,.45,1],[1,.8,.08],[.85,.9,1],[.7,.12,1],[.2,1,.12],[1,.18,.55],[1,.43,.08]];
const shadowVertex='varying vec2 shadowUv;void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const shadowFragment='uniform float opacity;varying vec2 shadowUv;void main(){float a=opacity*pow(1.0-smoothstep(.12,1.0,length(shadowUv*2.0-1.0)),1.8);if(a<.002)discard;gl_FragColor=vec4(0.0,0.0,0.0,a);}';
const particleVertex=`attribute vec3 particleColor;attribute float particleSize;attribute float particleAlpha;attribute float particleGlow;
uniform float viewportHeight;varying vec3 tint;varying float opacity;varying float glow;
void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(particleSize*viewportHeight/max(1.0,-p.z),1.0,64.0);tint=particleColor;opacity=particleAlpha;glow=particleGlow;}`;
const particleFragment=`uniform bool glowOnly;varying vec3 tint;varying float opacity;varying float glow;
void main(){if(glowOnly&&glow<.5)discard;float radius=length(gl_PointCoord*2.0-1.0);if(radius>1.0)discard;gl_FragColor=vec4(tint,opacity*pow(1.0-radius,1.5));
#include <colorspace_fragment>
}`;
export class EnhancedEffects{
 constructor(view){
  this.view=view;this.enabled=false;this.adaptive=new AdaptiveResolution();this.particles=new VisualParticles();this.flashes=[];this.shadows=new Map();this.supports=new Map();this.trails=new WeakMap();this.clock=0;this.lastCollision=new Map();this.materials=new WeakSet();this.shadowCursor=0;this.flashTotal=0;
  this.group=new THREE.Group();this.group.name='enhanced-visuals';this.group.visible=false;view.scene.add(this.group);
  this.uniforms={enhancedEffects:{value:false},enhancedLightPositions:{value:Array.from({length:4},()=>new THREE.Vector4(0,-1e6,0,1))},enhancedLightColors:{value:Array.from({length:4},()=>new THREE.Vector3())}};
  this.particleGeometry=new THREE.BufferGeometry();
  for(const [name,size]of [['position',3],['particleColor',3],['particleSize',1],['particleAlpha',1],['particleGlow',1]])this.particleGeometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(this.particles.capacity*size),size).setUsage(THREE.DynamicDrawUsage));
  this.particleGeometry.setDrawRange(0,0);
  this.particleMaterial=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,uniforms:{viewportHeight:{value:200},glowOnly:{value:false}},transparent:true,depthWrite:false,toneMapped:false});
  this.points=new THREE.Points(this.particleGeometry,this.particleMaterial);this.points.frustumCulled=false;this.points.userData.enhancedGlow=true;this.points.renderOrder=2;this.group.add(this.points);
 }
 setEnabled(enabled){
  this.enabled=enabled;this.uniforms.enhancedEffects.value=enabled;this.group.visible=enabled;
  if(!enabled){this.clear();this.pipeline?.dispose();this.pipeline=null;this.view.scene.fog=null;this.adaptive.reset();delete this.view.renderer.domElement.dataset.msaaSamples;Object.assign(this.view.renderer.domElement.dataset,{enhancedParticles:'0',enhancedShadows:'0',enhancedFlashes:'0',enhancedFog:'false'})}
 }
 clear(){
  this.frameScale=null;this.flashes.length=0;this.particles.clear();this.particleGeometry.setDrawRange(0,0);this.supports.clear();this.trails=new WeakMap();this.lastCollision.clear();
  for(const shadow of this.shadows.values()){shadow.material.dispose();shadow.geometry.dispose();this.group.remove(shadow)}this.shadows.clear();
  for(const color of this.uniforms.enhancedLightColors.value)color.set(0,0,0);this.pipeline?.clearMaterials();
 }
 sampleFrame(dt,active,paused=false){this.paused=paused;if(this.enabled)this.adaptive.sample(dt,active)}
 decorate(material){
  if(!material.isMeshBasicMaterial||this.materials.has(material))return;this.materials.add(material);
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey().toString();
  material.onBeforeCompile=shader=>{
   previous.call(material,shader);Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader='varying vec3 enhancedWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nenhancedWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader='varying vec3 enhancedWorld;\nuniform bool enhancedEffects;\nuniform vec4 enhancedLightPositions[4];\nuniform vec3 enhancedLightColors[4];\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
if(enhancedEffects){for(int i=0;i<4;i++){float falloff=max(0.0,1.0-distance(enhancedWorld,enhancedLightPositions[i].xyz)/enhancedLightPositions[i].w);diffuseColor.rgb*=vec3(1.0)+enhancedLightColors[i]*falloff*falloff;}}`);
  };material.customProgramCacheKey=()=>key+'-enhanced-flashes-v1';material.needsUpdate=true;
 }
 flash(position,color,radius,life){this.flashTotal++;this.flashes.push({position:{...position},color:color.slice(),radius,life,age:0});if(this.flashes.length>24)this.flashes.shift()}
 event(event,sim){
  if(!this.enabled)return;const r=sim.runners[event.runner];if(!r)return;
  const position={x:r.x,y:r.y+1.2,z:r.z},color=COLORS[(r.id||0)%8];
  if(event.type==='shot'){
   const muzzle=emitterOrigins(r,r.id===sim.player)[0];this.flash(muzzle,color,14,.13);
   for(let i=0;i<3;i++)this.particles.add(muzzle,{color,life:.12,size:.13,speed:1});
  }else if(event.type==='destroyed'){
   this.flash(position,[1,.45,.12],32,.45);this.particles.burst(position,true);
  }else if(event.type==='hit'){
   this.flash(position,[1,.65,.25],12,.12);this.particles.burst(position);
  }else if(event.type==='collision'&&Math.abs(event.speed||0)>8&&this.clock-(this.lastCollision.get(r.id)??-Infinity)>.18){
   this.lastCollision.set(r.id,this.clock);const normal=event.normal||{};
   this.particles.burst({x:r.x-(normal.x||0)*3,y:r.y+.5,z:r.z-(normal.z||0)*3});
  }
 }
 sync(sim,dt){
  if(!this.enabled)return;dt=Math.max(0,Math.min(.1,dt));this.clock+=dt;this.particles.step(dt);
  this.flashes=this.flashes.filter(f=>{f.age+=dt;return f.age<f.life});
  const camera=this.view.camera.position,nearest=[...this.flashes].sort((a,b)=>camera.distanceToSquared(a.position)-camera.distanceToSquared(b.position)).slice(0,4);
  for(let i=0;i<4;i++){const f=nearest[i],position=this.uniforms.enhancedLightPositions.value[i],color=this.uniforms.enhancedLightColors.value[i];if(f){position.set(f.position.x,f.position.y,f.position.z,f.radius);color.fromArray(f.color).multiplyScalar(2.5*(1-f.age/f.life))}else color.set(0,0,0)}
  const live=sim.projectiles.filter(p=>!p.pending&&!p.hidden&&p.life>0&&(!p.kind||p.kind==='Laser'||p.kind==='Missile')).sort((a,b)=>camera.distanceToSquared(a)-camera.distanceToSquared(b)).slice(0,16);
  for(const p of live){
   const old=this.trails.get(p),distance=old?Math.hypot(p.x-old.x,p.y-old.y,p.z-old.z):0;
   if(distance>.25&&distance<25){const steps=Math.min(3,Math.ceil(distance/1.6));for(let j=0;j<steps;j++){
    const t=j/steps,point={x:old.x+(p.x-old.x)*t,y:old.y+(p.y-old.y)*t,z:old.z+(p.z-old.z)*t};
    this.particles.add(point,{color:p.kind==='Missile'?[.3,.31,.33]:COLORS[(p.owner||0)%8],life:p.kind==='Missile'?.55:.12,size:p.kind==='Missile'?.8:.1,smoke:p.kind==='Missile',trail:true});
   }}this.trails.set(p,{x:p.x,y:p.y,z:p.z});
  }
  this.updateShadows(sim);this.uploadParticles();
 }
 updateShadows(sim){
  const active=sim.runners.filter(r=>!r.dead&&!r.inactive&&runnerBodyVisible(r));
  const ordered=active.length?[active.find(r=>r.id===sim.player),...active.slice(this.shadowCursor),...active.slice(0,this.shadowCursor)].filter(Boolean):[];let budget=2;
  this.shadowCursor=active.length?(this.shadowCursor+1)%active.length:0;
  for(const r of ordered){const old=this.supports.get(r.id);if(budget&&(!old||this.clock-old.time>.18||Math.hypot(r.x-old.x,r.z-old.z)>4)){
   const hits=this.view.ground(r.x,r.z,r.y,true);this.supports.set(r.id,{x:r.x,z:r.z,time:this.clock,hits:Array.isArray(hits)?hits:[]});budget--;
  }}
  for(const shadow of this.shadows.values())shadow.visible=false;
  for(const r of active){
   const sample=this.supports.get(r.id);if(!sample)continue;
   const supports=sample.hits.map(p=>({...p,height:p.height-((p.normal?.x||0)*(r.x-sample.x)+(p.normal?.z||0)*(r.z-sample.z))/(p.normal?.y||1)}));
   const pose=contactShadowPose(r,supports);if(!pose)continue;
   let mesh=this.shadows.get(r.id);if(!mesh){mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({vertexShader:shadowVertex,fragmentShader:shadowFragment,uniforms:{opacity:{value:.2}},transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));mesh.userData.enhancedSkipGlow=true;mesh.renderOrder=-2;this.group.add(mesh);this.shadows.set(r.id,mesh)}
   const n=new THREE.Vector3(pose.normal.x,pose.normal.y,pose.normal.z).normalize();if(n.y<0)n.negate();
   const forward=new THREE.Vector3(-Math.sin(pose.yaw),0,-Math.cos(pose.yaw));forward.addScaledVector(n,-forward.dot(n)).normalize();const right=new THREE.Vector3().crossVectors(forward,n).normalize();
   mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,forward,n));mesh.position.set(pose.x,pose.y,pose.z);mesh.scale.set(8*pose.scale,12*pose.scale,1);mesh.material.uniforms.opacity.value=pose.opacity;mesh.visible=true;
  }
 }
 uploadParticles(){
  const attributes=this.particleGeometry.attributes;this.particles.items.forEach((p,i)=>{
   const fade=1-p.age/p.life;attributes.position.setXYZ(i,p.x,p.y,p.z);attributes.particleColor.setXYZ(i,...p.color);
   attributes.particleSize.setX(i,p.size*(p.smoke?1+p.age*1.4:1));attributes.particleAlpha.setX(i,(p.smoke ? .32 : 1)*fade);attributes.particleGlow.setX(i,p.smoke?0:1);
  });for(const attribute of Object.values(attributes))attribute.needsUpdate=true;this.particleGeometry.setDrawRange(0,this.particles.items.length);
 }
 render(scene,camera){
  if(this.view.hud){const [color,density]=FOG_PROFILES[(this.view.enhancedArena||1)-1]||FOG_PROFILES[0];if(this.fogArena!==this.view.enhancedArena){this.fog=new THREE.FogExp2(color,density);this.fogArena=this.view.enhancedArena}scene.fog=this.fog}else scene.fog=null;
  scene.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[])this.decorate(material)});
  this.particleMaterial.uniforms.viewportHeight.value=(this.view.hud?138:200)*this.view.renderScale;
  this.pipeline??=new EnhancedPipeline(this.view.renderer);this.pipeline.render(scene,camera);this.frameScale=this.view.renderScale;
  const canvas=this.view.renderer.domElement;canvas.dataset.enhancedParticles=String(this.particles.items.length);canvas.dataset.enhancedShadows=String([...this.shadows.values()].filter(s=>s.visible).length);canvas.dataset.enhancedFlashes=String(this.flashes.length);canvas.dataset.enhancedFlashTotal=String(this.flashTotal);canvas.dataset.enhancedFog=String(!!scene.fog);canvas.dataset.adaptiveScale=String(this.view.renderScale);
 }
}
