import './diagnostic-setup.js';
import {activateResourceService,saveResources,pinResources,openResourceDB} from './resource-db.js';
const state=document.querySelector('#state');let selected=null;
try{await activateResourceService();state.textContent='Ready'}catch(error){state.textContent=error.message}
async function install(name){
 try{
  const installation=await saveResources([{path:'probe.json',data:new TextEncoder().encode(JSON.stringify({name})).buffer}],{sourceSha256:'probe-'+name,arenas:[],musicTracks:[]},'test:'+name);
  await pinResources(installation.id);selected=name;state.textContent=JSON.stringify({installed:name});
 }catch(error){state.textContent=JSON.stringify({error:error.message})}
}
document.querySelector('#install-a').onclick=()=>install('A');
document.querySelector('#install-b').onclick=()=>install('B');
document.querySelector('#read').onclick=async()=>{try{const r=await fetch('assets/probe.json');state.textContent=JSON.stringify({expected:selected,actual:await r.json(),status:r.status})}catch(error){state.textContent=JSON.stringify({error:error.message})}};

document.querySelector('#cache').onclick=async()=>{const db=await openResourceDB();try{const keys=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});state.textContent=JSON.stringify({keys})}finally{db.close()}};
