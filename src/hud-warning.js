// 437620 warning action: a shared lock takes precedence over low positive
// health, the onset visits the timer twice, and subsequent blinks once/frame.
export function stepHudWarning(state,{health,locked},seconds){
 const reason=locked?"You've been locked on":health>0&&health<25?'Your health is dangerously low':null,dt=Math.fround(seconds);
 if(!reason){Object.assign(state,{active:false,timer:0,shade:null,message:null});return {started:false,clear:true}}
 let started=false;
 if(!state.active){state.active=true;state.message=reason;state.timer=Math.fround((state.timer??0)+dt);started=true}
 state.shade=Math.trunc(state.timer)%2?'h':'l';state.timer=Math.fround(state.timer+dt);return {started,clear:false};
}
export function playerIsLocked(sim,player){return sim.runners.some(r=>r.id!==player&&!r.dead&&!r.inactive&&!r.respawn&&!r.escaped&&!r.opponentExit&&r.missileLockTarget===player)}
