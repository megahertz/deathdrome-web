// Source artwork uses 320x200 logical coordinates and 2x bitmap assets.
// Only empty chrome/glass strips expand. Instrument layers use translation.
export const HUD_STRETCH_BANDS=Object.freeze([
 {panel:'top',y:0,height:48,flex:224,origin:0},
 {panel:'bottom',y:137,height:55,flex:155,origin:137},
 {panel:'bottom',y:192,height:8,flex:182,origin:137}
]);
export function hudBandSlices(panel,{y,height,flex,origin=0}){
 const s=panel.scale,extra=Math.max(0,panel.width-320*s),dy=panel.y+(y-origin)*s;
 return [
  {sx:0,sy:y*2,sw:flex*2,sh:height*2,dx:panel.x,dy,dw:flex*s,dh:height*s},
  {sx:flex*2,sy:y*2,sw:2,sh:height*2,dx:panel.x+flex*s,dy,dw:s+extra,dh:height*s},
  {sx:(flex+1)*2,sy:y*2,sw:(319-flex)*2,sh:height*2,dx:panel.x+(flex+1)*s+extra,dy,dw:(319-flex)*s,dh:height*s}
 ];
}
export function hudWidgetSlices(panel,{y,height,split,origin=0}){
 const s=panel.scale,extra=Math.max(0,panel.width-320*s),dy=panel.y+(y-origin)*s;
 return [
  {sx:0,sy:y*2,sw:split*2,sh:height*2,dx:panel.x,dy,dw:split*s,dh:height*s},
  {sx:split*2,sy:y*2,sw:(320-split)*2,sh:height*2,dx:panel.x+split*s+extra,dy,dw:(320-split)*s,dh:height*s}
 ];
}
export function hudAnchorX(panel,x,anchor='left'){
 const extra=Math.max(0,panel.width-320*panel.scale);
 return panel.x+x*panel.scale+(anchor==='right'?extra:anchor==='center'?extra/2:0);
}
