import {GAME_TABLES} from './game-tables.js';
import {drawBitmapText} from './bitmap-ui.js';
// 424b70 results screen: 449704 text calls, including the domain-specific X
// coordinates stored at 48ecf6. Keep these separate from HTML font metrics.
const domainX=[110,115,105,127,107,120,115,115];
export function resultLabels(sim,{win=true,arena=sim.arena,round=sim.round,player=sim.player}={}){
 const labels=[],add=(value,x,y,color='whit')=>labels.push({value:String(value),x,y,color,size:10});
 add(GAME_TABLES.domains[arena-1].name,domainX[arena-1],15,'red');
 add(win?`ROUND ${round} COMPLETED`:'GAME OVER',win?70:115,27,'red');
 if(win){add('KILL BONUS',15,65);add(sim.roundBonus?.kills??0,225,65);add('TIME BONUS',15,95);add(sim.roundBonus?.time??0,225,95);add('EXTRA LIFE CREDITS',15,125);add(sim.roundBonus?.credits??0,225,125)}
 add('TOTAL SCORE',15,175);add(sim.score,225,175);return labels;
}
export function resultContinuation({win,arena,round}){return !win?{kind:'menu'}:round<3?{kind:'round',arena,round:round+1}:arena<8?{kind:'domain',arena:arena+1,round:1}:{kind:'freedom'}}
export function visibleResultLabels(sim,{rows=Infinity,flashingRow=0,numberVisible=true,...options}={}){
 const visibleY=options.win===false?27:rows<1?27:rows<2?65:rows<3?95:125,flashY=options.win===false?175:[0,65,95,125][flashingRow];
 return resultLabels(sim,options).filter(label=>(label.y<=visibleY||(label.y===175&&rows>0))&&(numberVisible||label.x!==225||label.y!==flashY)).map(label=>label.y===175&&label.x===225&&rows===1&&options.win!==false?{...label,value:String(sim.score-(sim.roundBonus?.time??0))}:label);
}
export function drawRoundResults(ctx,sim,{picture,rows=Infinity,flashingRow=0,numberVisible=true,...options}){
 ctx.clearRect(0,0,320,200);ctx.imageSmoothingEnabled=false;
 const background=picture('images/dombak4');if(background.complete&&background.naturalWidth)ctx.drawImage(background,0,0,320,200);
 for(const label of visibleResultLabels(sim,{...options,rows,flashingRow,numberVisible}))drawBitmapText(ctx,label.value,label.x,label.y,label);
}
// Repeated keydown events from a driving/fire key held across the transition
// must not dismiss results. Each results screen advances at most once.
export function resultAdvance(action){let consumed=false;return event=>{if(consumed||event?.repeat)return false;consumed=true;action();return true}}
