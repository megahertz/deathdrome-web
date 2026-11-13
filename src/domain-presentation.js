import {drawBitmapText,bitmapWidth} from './bitmap-ui.js';
// Shared by the game and the visible presentation comparison harness.
export function drawDomainIntro(g,state,{picture,arena=1,round=1,snapshot=null}){
 g.clearRect(0,0,320,200);g.imageSmoothingEnabled=false;
 const image=(name,x,y,w,h)=>{const im=picture('images/'+name);if(im.complete&&im.naturalWidth)g.drawImage(im,x,y,w,h)};
 if(state.phase==='split'){
  g.fillStyle='#000';g.fillRect(0,0,320,200);
  if(snapshot){for(let y=0;y<200;y++){let shift=Math.floor(state.split*6)*(y%2?1:-1);g.drawImage(snapshot,0,y,320,1,shift,y,320,1)}g.globalAlpha=Math.sin(state.split*Math.PI)*.5;g.drawImage(snapshot,2,0,320,200);g.globalAlpha=1}
  if(state.fromGo)for(let i=0;i<5;i++){g.fillStyle='#0a270d';g.fillRect(135+i*29,68,23,4);g.fillStyle='#20c633';g.fillRect(135+i*29,68,Math.floor(23*Math.max(0,Math.min(1,state.split*5-i))),4)}
 }else if(state.phase==='prepare'){g.fillStyle='#000';g.fillRect(0,0,320,200);drawBitmapText(g,'PREPARING DOMAINS...',93,96,{color:'red',size:7})}
 else if(state.phase!=='scene'){
  g.fillStyle='#000';g.fillRect(0,0,320,200);g.save();const scale=Math.max(.001,state.mapScale??1);g.translate(0,100*(1-scale));g.scale(1,scale);
  image('sp_a'+arena,0,0,320,200);const locations=[[104,39],[104,100],[23,100],[23,39]],already=Math.max(0,round-1);
  for(let q=0;q<Math.min(4,round+1);q++){const progress=q<already?1:state.unlocks[q-already]??0,[x,y]=locations[q];if(progress>0){g.save();g.beginPath();g.rect(x,y+Math.floor(30.5*(1-progress)),81,Math.ceil(61*progress));g.clip();image(`sp_a${arena}q${q+1}`,x,y,81,61);g.restore()}}
  const label=round===1?'CLEARING DOMAIN...':'PREPARE FOR NEXT ROUND...';drawBitmapText(g,label.slice(0,state.textCharacters),round===1?80:40,180,{color:'red'});if(state.textCharacters>0){g.save();g.translate((round===1?80:40)+bitmapWidth(label,10)+11,186);g.scale(Math.cos(state.seconds*7),1);image('dd',-6,-6,13,12);g.restore()}g.restore();
 }
 if(state.black>0){g.fillStyle=`rgba(0,0,0,${state.black})`;g.fillRect(0,0,320,200)}
}
