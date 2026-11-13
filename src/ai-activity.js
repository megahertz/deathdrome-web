import {GAME_TABLES} from './game-tables.js';
import {aiClock} from './ai-actions.js';
export const AI_ACTIVITY=GAME_TABLES.ai.activity;

// 42bb9e..42bc18: a distant actor gets five seconds before its model action
// sleeps. Region overlap or the final 35 seconds wakes it immediately.
export function stepAIActivity(sim,r){
 if(!r.navigation)return r.aiActivity!==2;
 const now=Math.fround(aiClock(sim)),state=r.aiActivity??0;
 const nearby=((r.zoneMask??0)&((sim.runners[sim.player]?.zoneMask??0)|(sim.entranceZoneMask??0)))!==0;
 if(nearby||Math.fround(sim.time)<=AI_ACTIVITY.keepActiveRemainingSeconds)r.aiActivity=0;
 else if(state===0){r.aiActivity=1;r.aiActivityUntil=Math.fround(now+AI_ACTIVITY.sleepDelaySeconds)}
 else if(state===1&&now>=(r.aiActivityUntil??0))r.aiActivity=2;
 return r.aiActivity!==2;
}
