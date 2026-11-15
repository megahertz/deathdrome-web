import {installedResources,saveResources,pinResources,activateResourceService,RESOURCE_VERSION} from './resource-db.js';
import {imageRequest,readImage} from './resource-source.js';
import {configureRegionData} from './region-data.js';
import {resourceURL} from './resource-urls.js';
import {ResourceProgress} from './resource-progress.js';
import {resourceDropTarget} from './resource-drop.js';
const request=imageRequest(location.search);
let active=null,worker=null,busy=false;
const panel=document.createElement('section');panel.id='resource-setup';panel.setAttribute('aria-label','Load DeathDrome');
panel.innerHTML=`<h1 class="resource-brand">DeathDrome</h1><div class="resource-card"><div class="resource-chooser"><p id="resource-instruction">Select a DeathDrome CD image or demo ZIP to play.</p><label id="pick-image" class="resource-file-button"><span>Choose file</span><input id="image-file" type="file" accept=".iso,.zip,application/octet-stream" aria-label="Choose a DeathDrome CD image or demo ZIP"></label></div><div class="resource-loading-indicator" aria-label="Loading game resources"><div class="resource-loading-title">Preparing your domain</div><progress id="resource-progress" aria-label="Loading progress"></progress><span id="resource-transfer"></span></div><p id="resource-status" role="status" aria-live="polite"></p></div>`;
const dropHint=document.createElement('div');dropHint.className='resource-drop-hint';dropHint.setAttribute('aria-hidden','true');dropHint.innerHTML='<span>Drop file to load<small>CD image or demo ZIP</small></span>';panel.append(dropHint);
const clearDropHint=resourceDropTarget(panel,{canLoad:()=>!busy,onFile:file=>void fromFile(file)});
panel.dataset.state='loading';document.body.append(panel);
const status=panel.querySelector('#resource-status'),progress=panel.querySelector('#resource-progress'),transfer=panel.querySelector('#resource-transfer');
const loading=new ResourceProgress();
function renderProgress(){progress.max=100;if(loading.indeterminate)progress.removeAttribute('value');else progress.value=loading.value;transfer.textContent=loading.label;progress.setAttribute('aria-valuetext',loading.label+' — '+loading.phase)}
function phase(text,options){loading.stage(text,options);status.textContent=text+(loading.phasePercent===null?'':` — ${loading.phasePercent}%`)+'…';renderProgress()}
function downloadProgress(value){loading.download(value);renderProgress()}
function showError(error){status.textContent=error.message||String(error);status.classList.add('resource-error')}
function controls(disabled){clearDropHint();if(disabled){loading.reset();renderProgress()}panel.dataset.state=disabled?'loading':'choose';panel.setAttribute('aria-busy',String(disabled));busy=disabled;panel.querySelectorAll('button,input').forEach(e=>e.disabled=disabled);if(disabled)status.classList.remove('resource-error')}
async function launch(profile){
 phase('Activating game resources');await pinResources(profile.id);phase('Starting DeathDrome');
 const regions=await fetch(resourceURL('assets/region-data.json'));
 if(!regions.ok)throw Error('Could not load installed game regions');configureRegionData(await regions.json());
 window.deathdromeInstallation=profile;
 try{const game=await import('./game.js');await game.ready;loading.ready();renderProgress();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));panel.remove();document.documentElement.classList.remove('resource-loading');
 // Hidden menu controls cannot receive focus while the loader is visible.
 // Select START GAME after revealing the menu so the first Enter activates it.
 document.querySelector('#menu button:not(:disabled)')?.focus({preventScroll:true});
 }catch(error){document.documentElement.classList.add('resource-loading');showError(Error('Could not start the game: '+error.message));throw error}
}
async function install(bytes,source){
 phase('Checking the game image',{value:70});
 if(!request.noCache&&active&&globalThis.crypto?.subtle){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(active.sourceSha256===digest){await launch(active);return}}
 worker=new Worker(new URL('./resource-worker.js',import.meta.url),{type:'module'});
 const result=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.type==='progress')phase(data.phase,{completed:data.completed,total:data.total});else if(data.type==='error')reject(Error(data.message));else if(data.type==='complete'||data.type==='reuse')resolve(data)};worker.onerror=e=>reject(Error(e.message||'Resource extraction failed'));worker.postMessage({bytes,cachedDigest:!request.noCache?active?.sourceSha256:null},[bytes])}).finally(()=>{worker.terminate();worker=null});
 if(result.type!=='reuse'){phase('Saving game resources');active=await saveResources(result.files,result.profile,source,{onProgress:({loaded,total})=>phase('Saving game resources',{completed:loaded,total})})}await launch(active);
}
async function fromURL(value){
 if(busy)return;controls(true);
 try{phase('Loading game image');
  const image=await readImage(value,{allowMissing:true,noCache:request.noCache,onProgress:downloadProgress});
  if(!image){status.textContent='';return}
  await install(image.bytes,image.url);
 }catch(error){showError(Error('Could not open the image. '+error.message))}finally{controls(false)}
}
function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onprogress=e=>downloadProgress({loaded:e.loaded,total:e.lengthComputable?e.total:0});reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.onabort=()=>reject(Error('File reading was cancelled'));reader.readAsArrayBuffer(file)})}
async function fromFile(file){if(!file||busy)return;controls(true);try{phase('Reading game image');await install(await readFile(file),'file:'+file.name)}catch(error){showError(error)}finally{controls(false)}}
panel.querySelector('#image-file').onchange=async event=>{await fromFile(event.target.files[0]);event.target.value=''};
document.documentElement.classList.add('resource-loading');phase('Looking for the game image');
try{
 await activateResourceService();if(!request.noCache)active=await installedResources();
 if(active?.converterVersion!==RESOURCE_VERSION)active=null;
 await fromURL(request.image);
}catch(error){controls(false);showError(error)}
