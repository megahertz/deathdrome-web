// 440294 schedules one palette action. 44023c adds 70 for its first callback,
// 140 for the second, then restores the base palette and permits a new flash.
export class PaletteFlash{
 constructor(){this.remaining=0;this.active=false}
 trigger(){if(this.active)return false;this.active=true;this.remaining=2;return true}
 frame(){if(!this.active)return 0;if(this.remaining>0)return this.remaining--===2?70:140;this.active=false;return 0}
}
export function flashedPaletteColor(color,amount){return color.map((byte,index)=>index<3?Math.min(255,byte+amount):byte)}
