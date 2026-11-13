// Native queued text actions: 419d7c / 419e98 / 419fa0. Each character's
// interval includes the zero-counter update; delays are engine-frame counts.
export class TypewriterSequence{
 constructor(paragraphs){this.paragraphs=paragraphs;this.visible=paragraphs.map(()=>0);this.index=0;this.stage='delay';this.remaining=paragraphs[0]?.delayFrames||0;this.accumulator=0;this.done=!paragraphs.length}
 finish(){this.visible=this.paragraphs.map(p=>p.text.length);this.done=true}
 step(seconds){
  this.accumulator+=seconds*60;let changed=false;
  while(this.accumulator>=1&&!this.done){this.accumulator--;let p=this.paragraphs[this.index];
   if(this.remaining>0){this.remaining--;continue}
   if(this.stage==='pause'){
    this.index++;if(this.index>=this.paragraphs.length){this.done=true;break}
    this.stage='delay';this.remaining=this.paragraphs[this.index].delayFrames;continue;
   }
   this.stage='typing';this.visible[this.index]++;changed=true;
   if(this.visible[this.index]>=p.text.length){this.stage='pause';this.remaining=p.pauseFrames}
   else this.remaining=p.text[this.visible[this.index]]==='\n'?p.delayFrames:p.intervalFrames;
  }
  return changed;
 }
}
