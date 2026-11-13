import {screenTextureSlopes,texturePolygonRows,polygonDepthSpan} from './texture-spans.js';
const f=Math.fround;
export function solidPolygonCommands(vertices,color,options={}){
 // Solid depth retains the row accumulator; the texture mapper stores it first.
 const points=vertices.map(p=>p.slice(0,3).map(f)),origin=points[0].slice(0,2),plane={origin,values:[points[0][2]],slopes:[screenTextureSlopes(points.slice(0,3),points.map(p=>p[2]))]},commands=[];
 for(const row of texturePolygonRows(points)){
  const visible=options.spanBuffer?options.spanBuffer.insert(row.y,polygonDepthSpan(plane,row,options.priorityBias,true)):null;
  if(visible){for(const span of visible)commands.push({x:span.x0,y:row.y,count:span.x1-span.x0+1,color})}
  else commands.push({...row,color});
 }
 return commands;
}
// Color is an already resolved framebuffer value. Native material lighting and
// palette selection happen upstream; this writer supports indexed or RGBA data.
export function drawOpaqueSolidPolygon(target,stride,vertices,color,options={}){
 const commands=solidPolygonCommands(vertices,color,options);
 for(const c of commands){
  const start=c.y*stride+c.x;
  if(c.x<0||c.x+c.count>stride||c.y<0||start+c.count>target.length)throw new RangeError('Projected polygon requires window clipping');
  target.fill(color,start,start+c.count);
 }
 return commands;
}
