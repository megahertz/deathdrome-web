import {resourceURL} from './resource-urls.js';
// The supplied ZFO atlases, exported without redrawing the original lettering.
export const GLYPHS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-_!?<>/"=| *';
// 449704 / 449984: only I, 1, period, comma and ! use the short advance.
export function glyphAdvance(c,size){return 'I1.,!'.includes(c)?Math.floor(size/2)+1:size}
export function bitmapWidth(label,size){return [...label.toUpperCase()].reduce((n,c)=>n+glyphAdvance(c,size),0)}
const atlases=new Map();
export function imageReady(image){
 if(image.complete)return image.naturalWidth?Promise.resolve():Promise.reject(Error('Could not load a game interface image'));
 return new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('Could not load a game interface image')),{once:true})});
}
export function bitmapFontsReady(){return Promise.all([...atlases.values()].map(imageReady))}
function atlas(name){
 if(!atlases.has(name)){let image=new Image();image.src=resourceURL(`assets/fonts/${name}.png`);atlases.set(name,image)}
 return atlases.get(name);
}
export function drawBitmapText(ctx,label,x,y,{size=10,color='whit',scale=1}={}){
 const image=atlas(`${size===10?'10':'5'}x_${color}`);if(!image.complete||!image.naturalWidth)return;
 ctx.imageSmoothingEnabled=false;
 for(const c of String(label).toUpperCase().replaceAll(':','*')){const index=GLYPHS.indexOf(c);if(index>=0)ctx.drawImage(image,0,index*size,size,size,x,y,size*scale,size*scale);x+=glyphAdvance(c,size)*scale}
}
export function bitmapLabel(label,{size=10,color='grey'}={}){
 let canvas=document.createElement('canvas'),value='',currentColor=color;
 canvas.className='bitmap-label';canvas.setAttribute('aria-hidden','true');
 function draw(shade){currentColor=shade;let image=atlas(`${size===10?'10':'5'}x_${shade}`),ctx=canvas.getContext('2d');
  const paint=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);value.split('\n').forEach((line,row)=>{let x=0;for(let c of line){let glyph=GLYPHS.indexOf(c);if(glyph>=0)ctx.drawImage(image,0,glyph*size,size,size,x,row*size,size,size);x+=glyphAdvance(c,size)}})};
  if(image.complete&&image.naturalWidth)paint();else image.addEventListener('load',paint,{once:true});
 }
 canvas.setColor=draw;canvas.setText=label=>{value=label.toUpperCase().replaceAll(':','*');let lines=value.split('\n');canvas.width=Math.max(1,...lines.map(line=>bitmapWidth(line,size)));canvas.height=lines.length*size;draw(currentColor)};canvas.setText(label);return canvas;
}
