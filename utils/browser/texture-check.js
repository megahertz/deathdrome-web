import './diagnostic-setup.js';
import * as THREE from './vendor/three.module.js';
import {NATIVE_TEXTURE_GLSL} from './native-texture.js';
const status=document.querySelector('#status');
try{
 const cases=await fetch('texture-check-fixtures.json').then(r=>r.json()),canvas=document.querySelector('#world');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});renderer.setSize(160,160,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,160,160,0,-1,1),batches=new Map();
 for(let i=0;i<cases.length;i++){
  const sample=cases[i],key=sample.size.join('x');
  if(!batches.has(key))batches.set(key,{size:sample.size,p:[],uv:[]});
  const batch=batches.get(key),x=i%20*8,y=160-Math.floor(i/20)*8;
  for(const [dx,dy] of [[0,0],[0,-8],[8,-8],[0,0],[8,-8],[8,0]]){batch.p.push(x+dx,y+dy,0);batch.uv.push(...sample.uv)}
 }
 for(const {size:[w,h],p,uv} of batches.values()){
  const image=document.createElement('canvas');image.width=w;image.height=h;const ctx=image.getContext('2d'),pixels=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.data.set([x%256,y%256,97,255],(y*w+x)*4);ctx.putImageData(pixels,0,0);
  const map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=map.minFilter=THREE.NearestFilter;map.wrapS=map.wrapT=THREE.RepeatWrapping;
  const material=new THREE.MeshBasicMaterial({map});material.onBeforeCompile=shader=>{shader.uniforms.nativeTextureSize={value:new THREE.Vector2(w,h)};shader.fragmentShader=NATIVE_TEXTURE_GLSL+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, nativeTextureUv(vMapUv) )'))};
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));scene.add(new THREE.Mesh(geometry,material));
 }
 renderer.render(scene,camera);
 const gl=renderer.getContext(),pixels=new Uint8Array(160*160*4);gl.readPixels(0,0,160,160,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 const mismatches=[];for(let i=0;i<cases.length;i++){const x=i%20*8+4,y=159-(Math.floor(i/20)*8+4),actual=Array.from(pixels.slice((y*160+x)*4,(y*160+x)*4+4)),expected=[...cases[i].native,97,255];if(actual.some((v,i)=>v!==expected[i]))mismatches.push({case:i,actual,expected})}
 status.textContent=JSON.stringify({passed:mismatches.length===0,cases:cases.length,mismatches},null,2);document.querySelector('#export').href=canvas.toDataURL('image/png');
}catch(error){status.textContent='Failed: '+error.message;console.error(error)}
