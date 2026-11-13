import './diagnostic-setup.js';
import {View,THREE,makeModel,modelData,texturesReady} from './renderer.js';
import {pickupYaw} from './presentation-sequences.js';
const view=new View(document.querySelector('#view'));view.scene.background=new THREE.Color(0x38596b);let lit=true,rear=false;
for(let x=-20;x<20;x+=4){let p=new THREE.Mesh(new THREE.PlaneGeometry(4,20),new THREE.MeshBasicMaterial({color:(x/4)%2?0x342e4d:0x3e4d35,side:THREE.DoubleSide}));p.rotation.x=-Math.PI/2;p.position.set(x+2,-.1,0);view.objects.add(p)}
const names=['enh_lock','enh_ntro','enh_shok','enh_disr','enh_ion','enh_nano'],models=[];
for(let i=0;i<names.length;i++){const mesh=makeModel(await modelData(names[i]));mesh.position.set((i-2.5)*4,0,0);view.objects.add(mesh);models.push(mesh)}
view.enablePlayerSpotlight(await modelData('redrunr'));view.playerSpot.set(0,0,0);
document.querySelector('#light').onclick=()=>{lit=!lit;view.playerSpot.set(0,lit?0:-10000,0);document.querySelector('#light').textContent='Light: '+(lit?'on':'off');render(0,true)};
document.querySelector('#rear').onclick=()=>{rear=!rear;render(0,true)};
function render(seconds,capture=false){view.camera.position.set(rear?6:0,6,rear?-25:25);view.camera.lookAt(0,1.5,0);for(const mesh of models)mesh.rotation.y=pickupYaw(view.camera.position,mesh.position);view.draw(seconds);document.querySelector('#state').textContent='6 source models; palette-zero transparency; native UV addressing; '+(rear?'rear':'front')+' view; light '+(lit?'on':'off')+'.';if(capture)document.querySelector('#export').href=document.querySelector('#view').toDataURL('image/png')}
await texturesReady();render(0,true);
function frame(now){requestAnimationFrame(frame);render(now/1000)}requestAnimationFrame(frame);
