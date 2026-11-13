export class CreditsSequence {
 constructor(data){this.data=data;this.frames=0;this.pixels=0;this.finished=false}
 step(dt){this.frames+=dt*this.data.referenceHz;let pixels=Math.floor((this.frames+1e-9)/this.data.framesPerScroll)*this.data.scrollPixels,changed=pixels!==this.pixels;this.pixels=pixels;this.finished=this.data.rows.at(-1).y-pixels<=this.data.finishY;return changed}
}
