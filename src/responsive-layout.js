const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function responsiveHudLayout(width,height,{touch=false,safe={}}={}){
 width=Math.max(1,width);height=Math.max(1,height);
 const inset={left:Math.max(0,safe.left||0),right:Math.max(0,safe.right||0),top:Math.max(0,safe.top||0),bottom:Math.max(0,safe.bottom||0)};
 const usableWidth=Math.max(1,width-inset.left-inset.right),usableHeight=Math.max(1,height-inset.top-inset.bottom);
 const topScale=Math.max(.25,Math.min(3.5,usableWidth/320,usableHeight/240));
 let bottomScale=topScale,bottomInset=inset.bottom,touchReserve=0,bottomX=inset.left,bottomWidth=usableWidth;
 if(touch){
  const button=clamp(height*.17,52,80),stick=clamp(height*.4,112,184);
  touchReserve=Math.max(button*2.5,stick)+16;
  const gap=usableWidth-touchReserve*2;
  if(gap>=208){bottomScale=Math.min(topScale,gap/320);bottomX+=touchReserve;bottomWidth=gap;}
  else bottomInset+=touchReserve; // A narrow portrait view keeps the instruments above the pads.
 }
 const top={x:inset.left,y:inset.top,width:usableWidth,height:48*topScale,scale:topScale};
 const bottom={x:bottomX,y:height-bottomInset-63*bottomScale,width:bottomWidth,height:63*bottomScale,scale:bottomScale};
 const playTop=inset.top+17*topScale,playBottom=Math.max(playTop+1,height-bottomInset-44*bottomScale);
 return {width,height,safe:inset,top,bottom,touchReserve,play:{x:0,y:playTop,width,height:playBottom-playTop},pixelRatio:Math.min(2,2/Math.min(topScale,bottomScale))};
}
export function responsiveRenderSize(width,height,pixelRatio=1,quality=1){
 width=Math.max(1,width);height=Math.max(1,height);
 const density=clamp(pixelRatio||1,1,2),budget=Math.sqrt(1920*1200/(width*height));
 const factor=Math.min(density,budget,4096/width,4096/height)*clamp(quality,.4,1);
 const h=Math.max(2,Math.floor(height*factor/2)*2),w=Math.max(2,Math.floor(h*width/height/2)*2);
 return {width:w,height:h};
}
export function applyResponsiveProjection(camera,layout){
 camera.fov=35;camera.near=.75;camera.far=1200;
 // Extend the image behind the instruments while retaining the playable
 // vertical field of view. This keeps the player's vehicle above the dashboard.
 camera.setViewOffset(layout.width,layout.play.height,0,-layout.play.y,layout.width,layout.height);
 camera.updateProjectionMatrix();
}
export function responsiveReticle(ndc,layout){
 const size=8*layout.top.scale;
 const x=clamp((ndc.x+1)*layout.width/2-size/2,layout.safe.left+size,Math.max(layout.safe.left+size,layout.width-layout.safe.right-size*2));
 const y=clamp((1-ndc.y)*layout.height/2-size/2,layout.play.y+size,Math.max(layout.play.y+size,layout.play.y+layout.play.height-size*2));
 return {x,y,width:size,height:size};
}
