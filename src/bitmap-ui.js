import {resourceURL} from './resource-urls.js';
// The supplied ZFO atlases, exported without redrawing the original lettering.
export const GLYPHS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-_!?<>/"=| *%';
// 449704 / 449984: only I, 1, period, comma and ! use the short advance.
export function glyphAdvance(c,size){return 'I1.,!'.includes(c)?Math.floor(size/2)+1:size}
export function bitmapWidth(label,size){return [...label.toUpperCase()].reduce((n,c)=>n+glyphAdvance(c,size),0)}
const atlases=new Map(),glyphImages=new WeakMap();
export function imageReady(image){
 if(image.complete)return image.naturalWidth?Promise.resolve():Promise.reject(Error('Could not load a game interface image'));
 return new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('Could not load a game interface image')),{once:true})});
}
export function bitmapFontsReady(){return Promise.all([...atlases.values()].map(imageReady))}
function atlas(name){
 if(!atlases.has(name)){let image=new Image();image.src=resourceURL(`assets/fonts/${name}.png`);atlases.set(name,image)}
 return atlases.get(name);
}
// The disc alphabet has no percent character. This authored font glyph uses
// the same cell metrics and the original zero's row colors in every palette.
const percentRows={10:['..........','.##....##.','.##...##..','.....##...','....##....','...##.....','..##..##..','.##...##..','##........','..........'],7:['.......','.##..#.','.##.#..','...#...','..#.##.','.#..##.','#......']};
function paintPercent(ctx,image,size){
 ctx.drawImage(image,0,GLYPHS.indexOf('0')*size,size,size,0,0,size,size);
 const reference=ctx.getImageData(0,0,size,size),glyph=ctx.createImageData(size,size);
 for(let y=0;y<size;y++){
  let ink=0,brightness=-1;
  for(let x=0;x<size;x++){const i=(y*size+x)*4,value=reference.data[i+3]?(reference.data[i]+reference.data[i+1]+reference.data[i+2]):-1;if(value>brightness){brightness=value;ink=i}}
  for(let x=0;x<size;x++)if(percentRows[size][y][x]==='#')glyph.data.set(reference.data.subarray(ink,ink+4),(y*size+x)*4);
 }
 ctx.putImageData(glyph,0,0);
}
// Fractional destination positions can sample an adjacent atlas row even with
// smoothing disabled. Cache isolated glyphs so scaling cannot expose neighbors.
function glyphImage(image,index,size){
 let cache=glyphImages.get(image);if(!cache){cache=new Map();glyphImages.set(image,cache)}
 const key=`${size}:${index}`;
 if(!cache.has(key)){const glyph=document.createElement('canvas');glyph.width=glyph.height=size;const ctx=glyph.getContext('2d');if(GLYPHS[index]==='%')paintPercent(ctx,image,size);else ctx.drawImage(image,0,index*size,size,size,0,0,size,size);cache.set(key,glyph)}
 return cache.get(key);
}
export function drawBitmapText(ctx,label,x,y,{size=10,color='whit',scale=1}={}){
 const image=atlas(`${size===10?'10':'5'}x_${color}`);if(!image.complete||!image.naturalWidth)return;
 ctx.imageSmoothingEnabled=false;
 for(const c of String(label).toUpperCase().replaceAll(':','*')){const index=GLYPHS.indexOf(c);if(index>=0)ctx.drawImage(glyphImage(image,index,size),x,y,size*scale,size*scale);x+=glyphAdvance(c,size)*scale}
}
export function bitmapLabel(label,{size=10,color='grey'}={}){
 let canvas=document.createElement('canvas'),value='',currentColor=color;
 canvas.className='bitmap-label';canvas.setAttribute('aria-hidden','true');
 function draw(shade){currentColor=shade;let image=atlas(`${size===10?'10':'5'}x_${shade}`),ctx=canvas.getContext('2d');
  const paint=()=>{if(currentColor!==shade)return;ctx.clearRect(0,0,canvas.width,canvas.height);value.split('\n').forEach((line,row)=>{let x=0;for(let c of line){let glyph=GLYPHS.indexOf(c);if(glyph>=0)ctx.drawImage(glyphImage(image,glyph,size),x,row*size);x+=glyphAdvance(c,size)}})};
  if(image.complete&&image.naturalWidth)paint();else image.addEventListener('load',paint,{once:true});
 }
 canvas.setColor=draw;canvas.setText=label=>{value=label.toUpperCase().replaceAll(':','*');let lines=value.split('\n');canvas.width=Math.max(1,...lines.map(line=>bitmapWidth(line,size)));canvas.height=lines.length*size;draw(currentColor)};canvas.setText(label);return canvas;
}
