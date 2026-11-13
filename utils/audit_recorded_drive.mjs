import './tests/setup.js';
// Per-step diagnostic against original human-runner demo states. The original
// record clock is quantized. During turns infer dt from native delta yaw / the
// recorded angular rate; report the limitation instead of treating this as an
// independent full-trajectory test. Collision/weapon effects can still differ.
import {readFile,writeFile} from 'node:fs/promises';
import {RecordedDemo} from '../src/recorded-demo.js';
import {updateDrive} from '../src/drive.js';
import {planarVelocity} from '../src/collision.js';
import {DYNAMICS} from '../src/simulation.js';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('private/assets/recordings/manifest.json',root)));
let reports=[];
for(let entry of manifest){
 let bytes=await readFile(new URL('private/assets/recordings/'+entry.file,root));
 let demo=new RecordedDemo(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),track=demo.tracks[0],samples=[];
 let r={id:0,yaw:0,turn:0,turnAcceleration:0,speed:0,acceleration:0,nitro:0},controlIndex=0;
 for(let i=1;i<track.length;i++){
  let a=track[i-1],b=track[i];while(controlIndex+1<demo.controls.length&&demo.controls[controlIndex+1].time<=a.time+.001)controlIndex++;
  let axes=demo.controls[controlIndex].axes,input={steer:axes[0]/100,throttle:-axes[1]/20};
  let yawDelta=Math.atan2(Math.sin((b.yaw-a.yaw)*Math.PI/180),Math.cos((b.yaw-a.yaw)*Math.PI/180))*180/Math.PI;
  let inferred=yawDelta/b.turnDegrees,usable=Number.isFinite(inferred)&&inferred>=.01&&inferred<=.09;
  let dt=usable?inferred:b.time-a.time;if(dt<=0)continue;
  Object.assign(r,{yaw:a.yaw*Math.PI/180,turn:a.turnDegrees*Math.PI/180,speed:-a.velocity[2],lateralSpeed:a.velocity[0]});
  updateDrive(r,input,dt,DYNAMICS);
  let velocity=planarVelocity(r);
  if(usable&&Math.abs(a.velocity[2])<=76&&Math.abs(b.velocity[2])<=76&&a.health===b.health)
   samples.push({time:b.time,dt,steer:input.steer,throttle:input.throttle,turnError:Math.abs(r.turn*180/Math.PI-b.turnDegrees),speedError:Math.abs(r.speed+b.velocity[2]),horizontalPositionError:Math.hypot(a.x+velocity.x*dt-b.x,a.z+velocity.z*dt-b.z)});
 }
 const summary=key=>{let xs=samples.map(s=>s[key]).sort((a,b)=>a-b);return {mean:xs.reduce((s,x)=>s+x,0)/xs.length,median:xs[Math.floor(xs.length*.5)],p90:xs[Math.floor(xs.length*.9)],maximum:xs.at(-1)}};
 reports.push({recording:entry.name,samples:samples.length,turnRateDegreesPerSecond:summary('turnError'),speedUnitsPerSecond:summary('speedError'),horizontalPositionUnits:summary('horizontalPositionError'),largestTurnDifferences:[...samples].sort((a,b)=>b.turnError-a.turnError).slice(0,5)});
}
let result={status:'diagnostic_only',method:'Warm-start every step from native forward/lateral velocity and angular rate. Infer dt from recorded yaw change / angular rate while turning. Keep rebuilt input accumulators across frames; assume ground contact.',limitations:['dt uses original angular-rate data, so this is not an independent trajectory-equivalence test','Ground contact flags are not reconstructed; airborne controls, slopes and full 3D orientation are not evaluated','Quantized recording timestamps, control application order, collisions and secondary effects need further investigation','Only human runner 0 and selected turning samples are evaluated; this is not an overall similarity score'],reports};
await writeFile(new URL('private/verification/recorded-drive-audit.json',root),JSON.stringify(result,null,2)+'\n');
console.log(reports.map(r=>({recording:r.recording,samples:r.samples,turnMedian:r.turnRateDegreesPerSecond.median,turnP90:r.turnRateDegreesPerSecond.p90,speedMedian:r.speedUnitsPerSecond.median,speedP90:r.speedUnitsPerSecond.p90})));
