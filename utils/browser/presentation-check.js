import './diagnostic-setup.js';
import {drawMenuFrame} from './menu-presentation.js';
import {DomainSequence,ResultSequence} from './presentation-sequences.js';
import {drawDomainIntro} from './domain-presentation.js';
import {drawRoundResults} from './round-results.js';
import {GAME_TABLES} from './game-tables.js';
import {AudioDirector} from './audio-director.js';
const $=s=>document.querySelector(s),g=$('#screen').getContext('2d');g.setTransform(2,0,0,2,0,0);
const pictures=new Map(),picture=path=>pictures.get(path),audio=new AudioDirector();let sequence=null,result=null,rows=null,fixedTime=5,trace=[],previous=0,showFrame=false;
for(let [i,d]of GAME_TABLES.domains.entries()){const option=document.createElement('option');option.value=i+1;option.textContent=d.name;$('#domain').append(option)}
const paths=['images/dombak1','images/domtitle',...['scrubyl','scrubyr','scrubxu','scrubxb','scrubcor'].map(n=>'images/'+n),'images/dombak2','images/go_title','images/dd','images/dombak4',...Array.from({length:8},(_,i)=>Array.from({length:5},(_,q)=>`images/sp_a${i+1}${q?'q'+q:''}`)).flat(),...['grey','red','whit'].map(c=>'fonts/10x_'+c)];
await Promise.all(paths.map(path=>new Promise(resolve=>{const im=new Image();im.onload=im.onerror=resolve;im.src='assets/'+path+'.png';pictures.set(path,im)})));
const snapshot=document.createElement('canvas');snapshot.width=320;snapshot.height=200;const sg=snapshot.getContext('2d');sg.drawImage(picture('images/dombak2'),0,0,320,200);sg.drawImage(picture('images/go_title'),54,6,214,33);
const roundSnapshot=document.createElement('canvas');roundSnapshot.width=320;roundSnapshot.height=200;const roundSnapshotContext=roundSnapshot.getContext('2d');
function resultFixture(){return [
 {score:8630,roundBonus:{kills:2000,time:1330,credits:0}},
 {score:23140,roundBonus:{kills:3000,time:640,credits:1}},
 {score:40830,roundBonus:{kills:20000,time:1330,credits:2}}
][Number($('#result-credit').value)]}
$('#result-credit').onchange=()=>{showFrame=false;sequence=null;result=null;fixedTime=null;rows=3};
function introOptions(){return {round:Number($('#round').value),fromGo:$('#start-origin').value==='go'}}
$('#start-origin').onchange=()=>{showFrame=false;rows=null;result=null;sequence=null;fixedTime=.3};
function cue(name){trace.push(name);$('#cues').textContent='События: '+trace.join(' → ');const sounds={split:'compclse',map:'compopen',unlock1:'wea_clik',unlock2:'wea_clik',clearing:Number($('#round').value)===1?'crimprep':'prepnext',fade:'compclse',scene:'round'+$('#round').value};audio.sound(sounds[name])}
$('#intro').onclick=()=>{showFrame=false;audio.unlock();trace=[];rows=null;result=null;fixedTime=null;sequence=new DomainSequence({...introOptions(),onCue:cue})};
document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{showFrame=false;rows=null;result=null;sequence=null;fixedTime=Number(b.dataset.time)});
$('#results').onclick=()=>{showFrame=false;audio.unlock();trace=[];sequence=null;fixedTime=null;result=new ResultSequence({onRow:n=>{trace.push('row '+n);$('#cues').textContent='События: '+trace.join(' → ');audio.sound('pla_hit')}});rows=0};
document.querySelectorAll('[data-rows]').forEach(b=>b.onclick=()=>{showFrame=false;sequence=null;result=null;fixedTime=null;rows=Number(b.dataset.rows)});
$('#menu-frame').onclick=()=>{showFrame=true};
const frameCanvas=document.createElement('canvas');frameCanvas.width=320;frameCanvas.height=200;const frameG=frameCanvas.getContext('2d');
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.1,(now-previous)/1000||0);previous=now;const arena=Number($('#domain').value),round=Number($('#round').value);
 if(showFrame){g.drawImage(picture('images/dombak1'),0,0,320,200);g.drawImage(picture('images/domtitle'),54,6,214,33);drawMenuFrame(frameG,.75,n=>picture('images/'+n));g.drawImage(frameCanvas,0,0);$('#state').textContent='Исходная сине-белая рамка: 75% расширения из центра';return}
 if(rows!==null){if(result)rows=result.step(dt);drawRoundResults(g,resultFixture(),{picture,win:true,arena,round,rows,flashingRow:result?.flashingRow??0,numberVisible:result?.numberVisible??true});$('#state').textContent='Статистика: строк '+rows+' из 3; бонус жизней: '+resultFixture().roundBonus.credits;return}
 const state=sequence?sequence.step(dt):Object.assign(new DomainSequence(introOptions()),{seconds:fixedTime}).state();if(!state.fromGo)drawRoundResults(roundSnapshotContext,resultFixture(),{picture,arena,round:Math.max(1,round-1),rows:3});drawDomainIntro(g,state,{picture,arena,round,snapshot:state.fromGo?snapshot:roundSnapshot});$('#state').textContent=`${state.fromGo?'GO! — зелёная полоса':'Между раундами — без зелёной полосы'}; фаза: ${state.phase}; время: ${state.seconds.toFixed(2)}; участки: ${state.unlocks.map(n=>Math.round(n*100)+'%').join(', ')}`;
}
requestAnimationFrame(frame);
