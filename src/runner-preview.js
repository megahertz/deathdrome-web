import {THREE,makeModel} from './renderer.js';
import {enhancedTextureSampling} from './graphics-quality.js';
import {runnerLightContour,LIGHT_MASK_GLSL} from './runner-light.js';
import {registeredTextureCoordinates,NATIVE_TEXTURE_GLSL} from './native-texture.js';
const isFloor=face=>/\/lcl_lt\//i.test(face.name);
function bounds(data,filter){const box=new THREE.Box3();for(const face of data.meshes)if(filter(face))for(const v of face.v)box.expandByPoint(new THREE.Vector3(...v.slice(0,3)));return box}
export function makeRunnerPreview(data){
 const root=new THREE.Group(),body=new THREE.Group(),model=makeModel(data,f=>!isFloor(f)),floor=new THREE.Group(),lightFrame=new THREE.Group(),floorModel=makeModel(data,isFloor);
 const bodyBounds=bounds(data,f=>!isFloor(f)),centre=bodyBounds.getCenter(new THREE.Vector3()),contour=runnerLightContour(data);
 // Keep the body centred. The source footprint keeps its authored offset ahead
 // of the vehicle, instead of being recentered into a circular patch.
 root.position.set(centre.x,0,3+centre.z);model.position.set(-centre.x,-bodyBounds.min.y,-centre.z);body.add(model);root.add(body);
 floorModel.position.set(-centre.x,0,-centre.z);lightFrame.add(floorModel);floor.add(lightFrame);root.add(floor);
 const angle={value:0},origin={value:root.position},edges={value:contour.edges.map(e=>new THREE.Vector3(...e))},centreUniform={value:new THREE.Vector2(centre.x,centre.z)};
 root.traverse(node=>{const material=node.material;if(!material?.isMeshBasicMaterial)return;
  const worldBase={value:new THREE.Vector2()},textureSize={value:new THREE.Vector2(1,1)};
  if(node.userData.runnerLight){
   const previousRender=node.onBeforeRender;
   node.onBeforeRender=(...args)=>{
    previousRender.call(node,...args);
    const positions=node.geometry.attributes.position,point=new THREE.Vector3(),vertices=[];
    for(let i=0;i<positions.count;i++)vertices.push(point.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).toArray());
    worldBase.value.fromArray(registeredTextureCoordinates(vertices).origin);
    const image=material.map?.image;textureSize.value.set(image?.width||1,image?.height||1);
   };
  }
  const previousCompile=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
   previousCompile.call(material,shader);
   shader.uniforms.previewOrigin=origin;shader.uniforms.previewAngle=angle;shader.uniforms.previewCentre=centreUniform;shader.uniforms.runnerLightEdges=edges;
   shader.vertexShader='varying vec3 previewWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npreviewWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
   if(node.userData.runnerLight){
    // MENU.GW registers lt to the world: origin 0,0; 0.0625 repeats/metre.
    // The outline turns, but texels stay anchored to the stationary floor.
    shader.uniforms.nativeWorldBase=worldBase;if(!node.userData.nativeTextureUV)shader.uniforms.nativeTextureSize=textureSize;
    shader.vertexShader='uniform vec2 nativeWorldBase;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
vec3 floorWorld=(modelMatrix*vec4(position,1.0)).xyz;
vMapUv=floorWorld.xz*0.0625-nativeWorldBase;
#endif`);
    if(!node.userData.nativeTextureUV){shader.uniforms.enhancedGraphics=enhancedTextureSampling;shader.fragmentShader=NATIVE_TEXTURE_GLSL+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, nativeTextureUv(vMapUv) )'));}
   }
   shader.fragmentShader='varying vec3 previewWorld;\nuniform vec3 previewOrigin;\nuniform vec2 previewCentre;\nuniform float previewAngle;\n'+LIGHT_MASK_GLSL+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 p=previewWorld.xz-previewOrigin.xz;
float c=cos(previewAngle),s=sin(previewAngle);
vec2 light=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+previewCentre;
if(runnerLightMask(light)<0.5)diffuseColor.rgb=vec3(0.0);`);
  };material.customProgramCacheKey=()=> 'runner-preview-source-light-v4'+(node.userData.runnerLight?'-floor':'-body')+(node.userData.nativeTextureUV?'-native':'');material.needsUpdate=true;
 });
 root.userData.preview={body,model,floor,lightFrame,floorModel,centre,angle,rotation:0};return root;
}
export function stepRunnerPreview(root,seconds){const p=root.userData.preview;p.rotation+=seconds*.5;p.body.rotation.y=p.rotation;p.angle.value=p.rotation*.12;p.lightFrame.rotation.y=p.angle.value}
