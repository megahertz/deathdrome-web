export function backAction(mode,hasMenuBack){
 if(mode==='playing')return 'pause';
 if(mode==='paused')return 'quit';
 if(mode==='loading')return 'none';
 return hasMenuBack?'menu':'none';
}
export function installBackGuard({history,location,events,onBack}){
 const marker='deathdromeBackGuard',state=()=>history.state&&typeof history.state==='object'?history.state:{};
 const arm=()=>history.pushState({...state(),[marker]:'guard'},'',location.href);
 if(state()[marker]!=='guard'){history.replaceState({...state(),[marker]:'base'},'',location.href);arm()}
 const pop=event=>{if(event.state?.[marker]==='guard')return;onBack('history');arm()};
 events.addEventListener('popstate',pop);return ()=>events.removeEventListener('popstate',pop);
}

export function installEdgeBack({events,onBack,edgeWidth=()=>28,enabled=()=>true,now=()=>performance.now()}){
 let finger=null,lastSwipe=-Infinity;
 const down=e=>{if(!enabled()||e.pointerType==='mouse'||finger||e.clientX>edgeWidth())return;finger={id:e.pointerId,x:e.clientX,y:e.clientY}};
 const cancel=e=>{if(finger?.id===e.pointerId)finger=null};
 const up=e=>{
  const p=finger;if(!p||p.id!==e.pointerId)return;finger=null;if(!enabled())return;
  const dx=e.clientX-p.x,dy=Math.abs(e.clientY-p.y);
  if(dx<64||dx<dy*1.8)return;
  e.preventDefault();lastSwipe=now();onBack('edge');
 };
 const click=e=>{if(e.detail&&now()-lastSwipe<700){e.preventDefault();e.stopImmediatePropagation()}};
 events.addEventListener('pointerdown',down,true);events.addEventListener('pointerup',up,true);events.addEventListener('pointercancel',cancel,true);events.addEventListener('click',click,true);
 return ()=>{events.removeEventListener('pointerdown',down,true);events.removeEventListener('pointerup',up,true);events.removeEventListener('pointercancel',cancel,true);events.removeEventListener('click',click,true)};
}

export function installTopTap({events,onTap,enabled,topHeight}){
 const fingers=new Map();
 events.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'&&enabled()&&e.clientY<=topHeight())fingers.set(e.pointerId,{x:e.clientX,y:e.clientY})},true);
 events.addEventListener('pointercancel',e=>fingers.delete(e.pointerId),true);
 events.addEventListener('pointerup',e=>{const p=fingers.get(e.pointerId);fingers.delete(e.pointerId);if(p&&enabled()&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<=14){e.preventDefault();onTap()}},true);
}

export function deduplicateBack(onBack,{now=()=>performance.now()}={}){
 let source=null,at=-Infinity;
 return next=>{const t=now();if(((next==='edge'&&source==='history')||(next==='history'&&source==='edge'))&&t-at<700)return;source=next;at=t;onBack()};
}

// Touch menu taps activate on release, without Safari's hover-first click.
// Suppress only the compatibility click from that same physical tap.
export function installMenuTaps(menu,{getMode,onBackgroundTap,now=()=>performance.now(),surface=menu}){
 const fingers=new Map();let activated=null;
 const button=e=>{const b=e.target.closest?.('button');return b&&menu.contains(b)?b:null};
 surface.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;fingers.set(e.pointerId,{button:button(e),x:e.clientX,y:e.clientY,mode:getMode()})});
 surface.addEventListener('pointercancel',e=>fingers.delete(e.pointerId));
 surface.addEventListener('pointerup',e=>{
  const p=fingers.get(e.pointerId);fingers.delete(e.pointerId);if(!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>14)return;
  const b=button(e);
  if(p.button===b&&b&&!b.disabled){e.preventDefault();activated={at:now(),x:e.clientX,y:e.clientY};b.click()}
  else if(!p.button&&!b&&p.mode==='paused'&&getMode()==='paused'){e.preventDefault();onBackgroundTap()}
 });
 menu.addEventListener('click',e=>{if(e.detail&&activated&&now()-activated.at<700&&Math.hypot(e.clientX-activated.x,e.clientY-activated.y)<18){e.preventDefault();e.stopImmediatePropagation()}},true);
}
