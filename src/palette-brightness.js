// 4478d0 adjusts encoded palette bytes, including black/white clamping.
export const DEFAULT_BRIGHTNESS=4;
export function brightnessLevel(value=DEFAULT_BRIGHTNESS){return Number.isFinite(value)?Math.max(0,Math.min(9,Math.round(value))):DEFAULT_BRIGHTNESS}
export function brightnessOffset(level){return 8*(brightnessLevel(level)-4)}
export function paletteBrightness(color,level){const shift=brightnessOffset(level);return color.map((value,i)=>i<3?Math.max(0,Math.min(255,value+shift)):value)}
export class PaletteBrightness{
 constructor(target,{id='deathdrome-palette-brightness'}={}){
  this.target=target;this.id=id;const doc=target.ownerDocument,ns='http://www.w3.org/2000/svg';
  const node=name=>doc.createElementNS(ns,name);
  this.svg=node('svg');this.svg.setAttribute('width','0');this.svg.setAttribute('height','0');this.svg.setAttribute('aria-hidden','true');this.svg.style.cssText='position:absolute;pointer-events:none;overflow:hidden';
  const defs=node('defs'),filter=node('filter'),transfer=node('feComponentTransfer');
  const flashTransfer=node('feComponentTransfer');
  this.flashChannels=['R','G','B'].map(channel=>{const f=node('feFunc'+channel);f.setAttribute('type','linear');f.setAttribute('slope','1');f.setAttribute('intercept','0');flashTransfer.append(f);return f});
  const flashAlpha=node('feFuncA');flashAlpha.setAttribute('type','identity');flashTransfer.append(flashAlpha);filter.append(flashTransfer);this.flash=0;
  filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');filter.setAttribute('x','0');filter.setAttribute('y','0');filter.setAttribute('width','100%');filter.setAttribute('height','100%');
  this.channels=['R','G','B'].map(channel=>{const f=node('feFunc'+channel);f.setAttribute('type','linear');f.setAttribute('slope','1');f.setAttribute('intercept','0');transfer.append(f);return f});
  const alpha=node('feFuncA');alpha.setAttribute('type','identity');transfer.append(alpha);filter.append(transfer);defs.append(filter);this.svg.append(defs);doc.body.append(this.svg);this.setLevel(DEFAULT_BRIGHTNESS);
 }
 setLevel(value){
  const level=brightnessLevel(value);if(this.level===level)return;this.level=level;
  const offset=brightnessOffset(level);
  // Chromium's SVG lookup-table generation can truncate an exact byte minus
  // a floating-point error (8 becomes 7). This bias is <0.00003 byte, far
  // below half a byte, and restores the exact integer result after truncation.
  const intercept=offset?offset/255+1e-7:0;
  for(const channel of this.channels)channel.setAttribute('intercept',String(intercept));
  this.applyFilter();
 }
 setFlash(value=0){const amount=Math.max(0,Math.min(255,Math.round(value)));if(this.flash===amount)return;this.flash=amount;for(const channel of this.flashChannels)channel.setAttribute('intercept',String(amount?amount/255+1e-7:0));this.applyFilter()}
 applyFilter(){this.target.style.filter=(this.flash||brightnessOffset(this.level))?`url(#${this.id})`:'none'}
 dispose(){this.svg.remove();this.target.style.filter='none'}
}
