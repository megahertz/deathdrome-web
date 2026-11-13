import './diagnostic-setup.js';
import {View,modelData,makeRunnerModel,poseRunnerModel,texturesReady} from './renderer.js';
import {makeRunnerPreview,stepRunnerPreview} from './runner-preview.js';
import {RUNNERS} from './simulation.js';
import {GAME_TABLES} from './game-tables.js';
const $=s=>document.querySelector(s),canvas=$('#world'),view=new View(canvas);
let runner,root,context='game',busy=false;
GAME_TABLES.runners.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent=r.name;$('#runner').append(option)});$('#runner').value='6';
function render(){
 const yaw=Number($('#angle').value)*Math.PI/180;
 if(context==='preview'){stepRunnerPreview(root,(yaw-root.userData.preview.rotation)*2)}else{
  runner.yaw=yaw;poseRunnerModel(root,runner);view.setPlayerSpotlight(runner);view.playerSpotRadius.value=Number($('#mask').value);
  view.camera.position.set(runner.x+Math.sin(yaw)*7,3,runner.z+Math.cos(yaw)*7);view.camera.rotation.set(0,yaw,0);
 }
 view.draw(0);$('#export').href=canvas.toDataURL('image/png');const floor=root?.userData.preview?.rasterFloor;$('#floor-export').hidden=!floor;if(floor)$('#floor-export').href=floor.canvas.toDataURL('image/png');
}
async function load(){
 if(busy)return;busy=true;$('#status').textContent='Loading…';
 try{
  context=$('#scene').value;view.preview=context==='preview';view.hud=false;
  const id=Number($('#runner').value),data=await modelData(RUNNERS[id]);
  if(context==='preview'){view.clear();root=makeRunnerPreview(data);view.scene.background.set(0);view.camera.position.set(0,2.3,10);view.camera.rotation.set(-10*Math.PI/180,0,0)}else{
   await view.arena(1);root=makeRunnerModel(data);runner={id,x:160,y:0,z:436,yaw:0,turn:0,health:100,dead:0};poseRunnerModel(root,runner);
  }
  view.objects.add(root);if(context==='game')view.enablePlayerSpotlight(data);
  await texturesReady();render();
  $('#status').textContent='Ready — '+context+'; '+GAME_TABLES.runners[id].name+'; heading '+$('#angle').value;
 }catch(error){$('#status').textContent='Failed: '+error.message;console.error(error)}finally{busy=false}
}
$('#load').onclick=load;$('#scene').onchange=load;$('#runner').onchange=load;
for(const id of ['#angle','#mask'])$(id).onchange=()=>{if(!busy){render();$('#status').textContent='Ready — '+context+'; heading '+$('#angle').value}};
load();
